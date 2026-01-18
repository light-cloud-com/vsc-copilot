// src/api/client.ts

import * as vscode from 'vscode';
import { ApiResponse } from './types';

export class ApiClient {
  private baseUrl: string;
  private secretStorage: vscode.SecretStorage;
  private static TOKEN_KEY = 'lightcloud.authToken';
  private static REFRESH_TOKEN_KEY = 'lightcloud.refreshToken';

  constructor(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('lightcloud');
    this.baseUrl = config.get('apiEndpoint') || 'https://api.light-cloud.com';
    this.secretStorage = context.secrets;
  }

  // ============ Token Management ============

  async getToken(): Promise<string | undefined> {
    return this.secretStorage.get(ApiClient.TOKEN_KEY);
  }

  async setToken(token: string): Promise<void> {
    await this.secretStorage.store(ApiClient.TOKEN_KEY, token);
  }

  async setRefreshToken(token: string): Promise<void> {
    await this.secretStorage.store(ApiClient.REFRESH_TOKEN_KEY, token);
  }

  async clearTokens(): Promise<void> {
    await this.secretStorage.delete(ApiClient.TOKEN_KEY);
    await this.secretStorage.delete(ApiClient.REFRESH_TOKEN_KEY);
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  // ============ HTTP Methods ============

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { skipAuth?: boolean; rawResponse?: boolean } = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const config = vscode.workspace.getConfiguration('lightcloud');
    const consoleUrl = config.get('consoleUrl') as string || 'https://console.light-cloud.com';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-AI-Source': 'lightcloud_copilot',
      // Origin header required for Cloud Armor to allow requests
      // Cloud Armor Rule 5000 allows requests with Origin matching *light-cloud*
      'Origin': consoleUrl,
    };

    if (!options.skipAuth) {
      const token = await this.getToken();
      if (!token) {
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' }
        };
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual', // Don't auto-follow redirects - API should return JSON
      });

      // Handle 3xx redirects (shouldn't happen with API calls)
      if (response.status >= 300 && response.status < 400) {
        return {
          success: false,
          error: { code: 'REDIRECT', message: 'Unexpected redirect response from API' }
        };
      }

      // Handle 401 - trigger re-authentication
      if (response.status === 401) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry with new token
          return this.request<T>(method, path, body, options);
        }
        return {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Session expired. Please login again.' }
        };
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: errorBody.code || `HTTP_${response.status}`,
            message: errorBody.message || response.statusText
          }
        };
      }

      const data = await response.json();
      return { success: true, data };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network request failed'
        }
      };
    }
  }

  private async refreshToken(): Promise<boolean> {
    const refreshToken = await this.secretStorage.get(ApiClient.REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    const config = vscode.workspace.getConfiguration('lightcloud');
    const consoleUrl = config.get('consoleUrl') as string || 'https://console.light-cloud.com';

    try {
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': consoleUrl,
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        await this.setToken(data.accessToken);
        if (data.refreshToken) {
          await this.setRefreshToken(data.refreshToken);
        }
        return true;
      }
    } catch {
      // Refresh failed
    }
    return false;
  }

  // ============ Public API Methods ============

  async get<T>(path: string, options?: { skipAuth?: boolean }): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: { skipAuth?: boolean }): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  // ============ SSE Stream ============

  async stream(
    path: string,
    onMessage: (data: string) => void,
    onError?: (error: Error) => void
  ): Promise<() => void> {
    const token = await this.getToken();
    const url = `${this.baseUrl}${path}`;
    const config = vscode.workspace.getConfiguration('lightcloud');
    const consoleUrl = config.get('consoleUrl') as string || 'https://console.light-cloud.com';

    const abortController = new AbortController();

    (async () => {
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream',
            'Origin': consoleUrl,
          },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              onMessage(line.slice(6));
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          onError?.(error);
        }
      }
    })();

    return () => abortController.abort();
  }
}
