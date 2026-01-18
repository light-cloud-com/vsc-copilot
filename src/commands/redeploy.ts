// src/commands/redeploy.ts

import * as vscode from 'vscode';
import { LightCloudApi } from '../api/endpoints';
import { getConfigManager } from '../utils/config-manager';

export class RedeployCommand {
  constructor(private api: LightCloudApi) {}

  async execute(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const configManager = getConfigManager();
    const savedConfig = configManager.read();

    // Check if we have a linked application with environment
    if (!savedConfig?.applicationId || !savedConfig?.organisationId || !savedConfig?.environmentId) {
      stream.markdown('## ⚠️ No Application Linked\n\n');
      stream.markdown('No `.lightcloud` config found in this workspace.\n\n');
      stream.markdown('Use `/deploy` to deploy your application first.\n');
      return { metadata: { command: 'redeploy', status: 'no-config' } };
    }

    stream.markdown('## 🔄 Redeploying...\n\n');
    stream.markdown(`**Application:** ${savedConfig.applicationName || 'Unknown'}\n`);
    stream.markdown(`**Environment:** ${savedConfig.environmentName || 'Production'}\n\n`);

    stream.progress('Triggering redeployment...');

    // Trigger redeployment using environment deploy endpoint
    const result = await this.api.deployEnvironment(
      savedConfig.organisationId,
      savedConfig.environmentId!
    );

    if (!result.success) {
      stream.markdown(`❌ **Redeployment failed:** ${result.error?.message || 'Unknown error'}\n`);
      return { metadata: { command: 'redeploy', status: 'error' } };
    }

    // Update last deployed timestamp
    configManager.update({ lastDeployedAt: new Date().toISOString() });

    // Build URLs
    const config = vscode.workspace.getConfiguration('lightcloud');
    const consoleUrl = config.get('consoleUrl') || 'https://console.light-cloud.com';
    const dashboardUrl = `${consoleUrl}/applications/${savedConfig.applicationId}/environments/${savedConfig.environmentId}/overview`;

    // Get deployed URL from the application
    const appResult = await this.api.getApplication(savedConfig.organisationId, savedConfig.applicationId);
    const app = appResult.data as any;
    const prodEnv = app?.environments?.find((e: any) => e.id === savedConfig.environmentId)
      || app?.environments?.find((e: any) => e.is_production)
      || app?.environments?.[0];
    const deployedUrl = prodEnv?.url || prodEnv?.deployed_url || app?.url;

    // Show success with URLs
    stream.markdown('## ✅ Redeployment Started!\n\n');
    stream.markdown(`**Status:** ${result.data?.status || 'deploying'}\n\n`);

    if (deployedUrl) {
      stream.markdown(`🔗 **URL:** ${deployedUrl}\n\n`);
    }
    stream.markdown(`📊 **Dashboard:** ${dashboardUrl}\n\n`);

    stream.markdown('Your application is rebuilding. Use `/status` to check progress.\n');

    return { metadata: { command: 'redeploy', status: 'success' } };
  }
}
