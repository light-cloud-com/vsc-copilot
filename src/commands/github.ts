// src/commands/github.ts

import * as vscode from 'vscode';
import { LightCloudApi } from '../api/endpoints';

export class GitHubCommands {
  private pollingInterval?: ReturnType<typeof setInterval>;

  constructor(private api: LightCloudApi) {}

  async connectGitHub(
    stream?: vscode.ChatResponseStream
  ): Promise<boolean> {
    // Check if already connected by listing installations
    const installationsResult = await this.api.listGitHubInstallations();

    if (installationsResult.success) {
      // Response is { configured: boolean, installations: [...] }
      const data = installationsResult.data as any;
      const installations = data?.installations || [];

      if (installations.length > 0) {
        const accounts = installations.map((i: any) => i.account_login).filter(Boolean).join(', ');

        if (stream) {
          stream.markdown('## ✅ GitHub Already Connected\n\n');
          stream.markdown(`Connected accounts: **${accounts || 'Unknown'}**\n\n`);
          stream.markdown('You can deploy from your GitHub repositories using `/deploy`.\n');
        } else {
          vscode.window.showInformationMessage(`GitHub already connected: ${accounts}`);
        }
        return true;
      }
    }

    // Get install URL
    const urlResult = await this.api.getGitHubInstallUrl();

    if (!urlResult.success || !urlResult.data?.url) {
      const errorMsg = urlResult.error?.message || 'Unknown error';
      console.error('[LightCloud] GitHub install URL error:', urlResult);
      vscode.window.showErrorMessage(`Could not get GitHub installation URL: ${errorMsg}`);
      return false;
    }

    // Open in browser
    await vscode.env.openExternal(vscode.Uri.parse(urlResult.data.url));

    if (stream) {
      stream.markdown('## 🔗 Connect GitHub\n\n');
      stream.markdown('Opening browser to install the Light Cloud GitHub App...\n\n');
      stream.markdown('**Steps:**\n');
      stream.markdown('1. Select your account or organization\n');
      stream.markdown('2. Choose repositories (all or select specific)\n');
      stream.markdown('3. Click "Install"\n\n');
      stream.markdown('Waiting for confirmation... ⏳\n');
    }

    // Poll for installation status
    return this.pollForInstallation();
  }

  private async pollForInstallation(): Promise<boolean> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes with 2s interval

      this.pollingInterval = setInterval(async () => {
        attempts++;

        const status = await this.api.getGitHubInstallationStatus();

        if (status.success && status.data?.installed) {
          this.cancelPolling();
          vscode.window.showInformationMessage('GitHub connected successfully!');
          resolve(true);
        }

        if (attempts >= maxAttempts) {
          this.cancelPolling();
          vscode.window.showWarningMessage('GitHub connection timed out. Please try again.');
          resolve(false);
        }
      }, 2000);
    });
  }

  cancelPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }
}
