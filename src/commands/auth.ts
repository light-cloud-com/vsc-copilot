// src/commands/auth.ts

import * as vscode from 'vscode';
import { ApiClient } from '../api/client';
import { LightCloudApi } from '../api/endpoints';
import * as crypto from 'crypto';

// Store pending auth sessions
const pendingAuthSessions = new Map<string, {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}>();

export class AuthCommands {
  private consoleUrl: string;

  constructor(
    private client: ApiClient,
    private api: LightCloudApi
  ) {
    const config = vscode.workspace.getConfiguration('lightcloud');
    this.consoleUrl = config.get('consoleUrl') as string || 'https://console.light-cloud.com';
  }

  /**
   * Browser-based login flow
   * Opens Light Cloud in browser, user logs in, token is returned via URI handler
   */
  async login(): Promise<boolean> {
    // Generate unique state for this auth session
    const state = crypto.randomBytes(16).toString('hex');

    // Build the auth URL
    const authUrl = `${this.consoleUrl}/auth/vscode?state=${state}`;

    // Show progress while waiting for auth
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Logging in to Light Cloud...',
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        progress.report({ message: 'Opening browser...' });

        // Open browser to auth page
        await vscode.env.openExternal(vscode.Uri.parse(authUrl));

        progress.report({ message: 'Waiting for authentication...' });

        try {
          // Wait for the callback with token
          const token = await this.waitForAuthCallback(state, cancellationToken);

          // Store the token
          await this.client.setToken(token);

          // Validate by fetching profile
          const result = await this.api.getProfile();

          if (result.success && result.data) {
            vscode.window.showInformationMessage(
              `Welcome to Light Cloud, ${result.data.first_name || result.data.email}!`
            );
            return true;
          } else {
            await this.client.clearTokens();
            vscode.window.showErrorMessage('Login failed: Could not verify credentials');
            return false;
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'cancelled') {
            vscode.window.showInformationMessage('Login cancelled');
          } else {
            vscode.window.showErrorMessage(
              `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
          return false;
        }
      }
    );
  }

  /**
   * Wait for the auth callback from the URI handler
   */
  private waitForAuthCallback(state: string, cancellationToken: vscode.CancellationToken): Promise<string> {
    return new Promise((resolve, reject) => {
      // Set timeout (5 minutes)
      const timeout = setTimeout(() => {
        pendingAuthSessions.delete(state);
        reject(new Error('Authentication timed out. Please try again.'));
      }, 5 * 60 * 1000);

      // Handle cancellation
      cancellationToken.onCancellationRequested(() => {
        clearTimeout(timeout);
        pendingAuthSessions.delete(state);
        reject(new Error('cancelled'));
      });

      // Store the session
      pendingAuthSessions.set(state, { resolve, reject, timeout });
    });
  }

  /**
   * Handle the auth callback from URI handler
   * Called by extension.ts when vscode://lightcloud.lightcloud-copilot/auth-callback is received
   */
  static handleAuthCallback(uri: vscode.Uri): void {
    const params = new URLSearchParams(uri.query);
    const token = params.get('token');
    const state = params.get('state');
    const error = params.get('error');

    if (!state) {
      vscode.window.showErrorMessage('Invalid auth callback: missing state');
      return;
    }

    const session = pendingAuthSessions.get(state);
    if (!session) {
      vscode.window.showErrorMessage('Auth session expired or invalid. Please try logging in again.');
      return;
    }

    // Clear timeout and remove session
    clearTimeout(session.timeout);
    pendingAuthSessions.delete(state);

    if (error) {
      session.reject(new Error(error));
    } else if (token) {
      session.resolve(token);
    } else {
      session.reject(new Error('No token received'));
    }
  }

  async logout(): Promise<void> {
    await this.api.logout();
    vscode.window.showInformationMessage('Logged out of Light Cloud');
  }

  async ensureAuthenticated(): Promise<boolean> {
    const isAuth = await this.client.isAuthenticated();
    if (isAuth) {
      // Verify token is still valid
      const result = await this.api.getProfile();
      if (result.success) return true;
    }

    // Prompt login
    const action = await vscode.window.showWarningMessage(
      'You need to login to Light Cloud first.',
      'Login'
    );

    if (action === 'Login') {
      return this.login();
    }

    return false;
  }
}
