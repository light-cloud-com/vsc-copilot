// src/commands/list.ts

import * as vscode from 'vscode';
import { LightCloudApi } from '../api/endpoints';
import { formatStatusEmoji } from '../utils/formatting';

export class ListCommand {
  constructor(private api: LightCloudApi) {}

  async execute(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    stream.progress('Fetching applications...');

    const profileResult = await this.api.getProfile();
    if (!profileResult.success || !profileResult.data?.organisations?.length) {
      stream.markdown('Could not fetch your profile.\n');
      return { metadata: { command: 'list', status: 'error' } };
    }

    const organisation = profileResult.data.organisations[0];
    const appsResult = await this.api.listApplications(organisation.id);

    if (!appsResult.success) {
      stream.markdown(`Error: ${appsResult.error?.message}\n`);
      return { metadata: { command: 'list', status: 'error' } };
    }

    const apps = appsResult.data || [];

    if (apps.length === 0) {
      stream.markdown('## 📦 Applications\n\n');
      stream.markdown('No applications found.\n\n');
      stream.markdown('Use `/deploy` to create your first application!\n');
      return { metadata: { command: 'list', status: 'empty' } };
    }

    // Build console URL
    const config = vscode.workspace.getConfiguration('lightcloud');
    const consoleUrl = config.get('consoleUrl') || 'https://console.light-cloud.com';

    stream.markdown('## 📦 Applications\n\n');
    stream.markdown(`Found ${apps.length} application${apps.length > 1 ? 's' : ''}:\n\n`);

    for (const app of apps) {
      // Get status and URL from production environment if available, fall back to app-level
      const prodEnv = (app as any).environments?.find((e: any) => e.is_production)
        || (app as any).environments?.[0];

      const displayStatus = prodEnv?.status || app.status;
      const displayUrl = prodEnv?.deployed_url || prodEnv?.url || app.url;
      const dashboardUrl = `${consoleUrl}/applications/${app.id}/environments/${prodEnv?.id}/overview`;

      const status = formatStatusEmoji(displayStatus);
      const type = app.deployment_type === 'static' ? '📄 Static' : '🐳 Container';

      stream.markdown(`### ${app.name}\n`);
      stream.markdown(`- **Status:** ${status} ${displayStatus}\n`);
      stream.markdown(`- **Type:** ${type}\n`);
      if (displayUrl) {
        stream.markdown(`- **URL:** ${displayUrl}\n`);
      }
      stream.markdown(`- **Dashboard:** [Open](${dashboardUrl})\n\n`);
    }

    stream.markdown('Use `/status <app-name>` to see details for a specific app.\n');

    return { metadata: { command: 'list', status: 'success', count: apps.length } };
  }
}
