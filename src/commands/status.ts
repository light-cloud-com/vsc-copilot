// src/commands/status.ts

import * as vscode from 'vscode';
import { LightCloudApi } from '../api/endpoints';
import { Application, Environment } from '../api/types';
import { formatStatusEmoji, formatRelativeTime } from '../utils/formatting';
import { getConfigManager } from '../utils/config-manager';

export class StatusCommand {
  constructor(private api: LightCloudApi) {}

  async execute(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    workspaceFolder?: vscode.WorkspaceFolder
  ): Promise<vscode.ChatResult> {
    stream.progress('Fetching application status...');

    // Get user profile
    const profileResult = await this.api.getProfile();
    if (!profileResult.success || !profileResult.data?.organisations?.length) {
      stream.markdown('Could not fetch your profile.\n');
      return { metadata: { command: 'status', status: 'error' } };
    }

    const organisation = profileResult.data.organisations[0];

    // Get applications
    const appsResult = await this.api.listApplications(organisation.id);
    if (!appsResult.success || !appsResult.data?.length) {
      stream.markdown('No applications found.\n\n');
      stream.markdown('Use `/deploy` to create your first application!\n');
      return { metadata: { command: 'status', status: 'empty' } };
    }

    // If specific app requested via prompt or from .lightcloud config
    let appName = request.prompt.trim();
    let apps = appsResult.data;

    // If no app name specified, check config
    if (!appName) {
      const configManager = getConfigManager();
      const savedConfig = configManager.read();
      if (savedConfig?.applicationName) {
        appName = savedConfig.applicationName;
        stream.markdown(`*Using application from \`.lightcloud\` config*\n\n`);
      }
    }

    if (appName) {
      apps = apps.filter(a =>
        a.name.toLowerCase().includes(appName.toLowerCase()) ||
        a.slug.toLowerCase().includes(appName.toLowerCase())
      );
    }

    if (apps.length === 0) {
      stream.markdown(`No application found matching "${appName}".\n`);
      return { metadata: { command: 'status', status: 'not-found' } };
    }

    // Show status for each app
    for (const app of apps) {
      await this.showAppStatus(stream, app, organisation.id);
    }

    return { metadata: { command: 'status', status: 'success' } };
  }

  private async showAppStatus(
    stream: vscode.ChatResponseStream,
    app: Application,
    organisationId: string
  ): Promise<void> {
    // Get environments
    const envsResult = await this.api.listEnvironments(organisationId, app.id);
    const environments = envsResult.data || [];

    // Find production environment for URLs
    const prodEnv = environments.find(e => e.is_production) || environments[0];
    const deployedUrl = prodEnv?.url || (app as any).url;

    // Build dashboard URL
    const config = vscode.workspace.getConfiguration('lightcloud');
    const consoleUrl = config.get('consoleUrl') || 'https://console.light-cloud.com';
    const dashboardUrl = `${consoleUrl}/applications/${app.id}/environments/${prodEnv?.id}/overview`;

    stream.markdown(`## 📊 Application Status\n\n`);
    stream.markdown(`**${app.name}**\n\n`);

    if (deployedUrl) {
      stream.markdown(`🔗 **URL:** ${deployedUrl}\n`);
    }
    stream.markdown(`📊 **Dashboard:** ${dashboardUrl}\n\n`);

    if (environments.length === 0) {
      stream.markdown('No environments found.\n');
      return;
    }

    // Check if this is an upload-based app (no GitHub repo)
    const isUploadBased = app.github_repo_url?.startsWith('upload://');

    // Environment table - different columns for upload vs GitHub based apps
    if (isUploadBased) {
      stream.markdown('| Environment | Status | Source | Last Deploy |\n');
      stream.markdown('|-------------|--------|--------|-------------|\n');
    } else {
      stream.markdown('| Environment | Status | Branch | Last Deploy |\n');
      stream.markdown('|-------------|--------|--------|-------------|\n');
    }

    const issues: { env: Environment; issue: string }[] = [];

    for (const env of environments) {
      const statusEmoji = formatStatusEmoji(env.status);
      const sourceDisplay = isUploadBased ? '📤 Uploaded' : (env.github_branch || '-');
      const lastDeploy = formatRelativeTime(env.updated_at);

      stream.markdown(`| ${env.name} | ${statusEmoji} ${env.status} | ${sourceDisplay} | ${lastDeploy} |\n`);

      if (env.status === 'degraded' || env.status === 'failed') {
        issues.push({ env, issue: `${env.status} status` });
      }
    }

    // Show issues
    if (issues.length > 0) {
      stream.markdown('\n');
      for (const { env, issue } of issues) {
        stream.markdown(`⚠️ **${env.name}** has issues:\n`);
        stream.markdown(`- ${issue}\n`);
      }
      stream.markdown('\n');
    }

    // Action button - show redeploy if there are issues
    if (issues.length > 0) {
      stream.button({
        command: 'lightcloud.redeploy',
        title: '🔄 Redeploy',
        arguments: [{ applicationId: app.id, organisationId }],
      });
    }
  }
}
