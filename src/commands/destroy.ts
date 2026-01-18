// src/commands/destroy.ts

import * as vscode from 'vscode';
import { LightCloudApi } from '../api/endpoints';
import { getConfigManager } from '../utils/config-manager';

export class DestroyCommand {
  constructor(private api: LightCloudApi) {}

  async execute(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    let target = request.prompt.trim();
    const configManager = getConfigManager();

    // If no target specified, check for .lightcloud config
    if (!target) {
      const savedConfig = configManager.read();
      if (savedConfig?.applicationId && savedConfig?.applicationName) {
        // Use the saved application from config
        stream.markdown('## ⚠️ Delete Application\n\n');
        stream.markdown(`Found linked application from \`.lightcloud\` config.\n\n`);
        stream.markdown(`**Warning:** This will permanently delete the application **${savedConfig.applicationName}** and all its environments.\n\n`);
        stream.markdown('### What will be removed:\n');
        stream.markdown('```diff\n');
        stream.markdown(`- Application: ${savedConfig.applicationName}\n`);
        stream.markdown(`- All environments and deployments\n`);
        stream.markdown(`- All environment variables\n`);
        stream.markdown(`- Build cache and logs\n`);
        stream.markdown('```\n\n');
        stream.markdown('This action **cannot be undone**.\n\n');

        stream.button({
          command: 'lightcloud.confirmDestroy',
          title: '🗑️ Confirm Delete',
          arguments: [{
            type: 'application',
            id: savedConfig.applicationId,
            name: savedConfig.applicationName,
            organisationId: savedConfig.organisationId,
          }],
        });
        stream.button({
          command: 'lightcloud.cancel',
          title: '❌ Cancel',
        });

        return { metadata: { command: 'destroy', status: 'confirm', target: savedConfig.applicationName } };
      }

      stream.markdown('## ⚠️ Delete What?\n\n');
      stream.markdown('No `.lightcloud` config found. Please specify what you want to delete:\n\n');
      stream.markdown('```\n@lightcloud /destroy <environment-name>\n@lightcloud /destroy <app-name> --app\n```\n');
      return { metadata: { command: 'destroy', status: 'missing-target' } };
    }

    const profileResult = await this.api.getProfile();
    if (!profileResult.success || !profileResult.data?.organisations?.length) {
      stream.markdown('Could not fetch your profile.\n');
      return { metadata: { command: 'destroy', status: 'error' } };
    }

    const organisation = profileResult.data.organisations[0];
    const appsResult = await this.api.listApplications(organisation.id);
    const apps = appsResult.data || [];

    // Check if deleting entire app
    const isAppDelete = target.includes('--app');
    const targetName = target.replace('--app', '').trim();

    if (isAppDelete) {
      // Find app by name
      const app = apps.find(a =>
        a.name.toLowerCase() === targetName.toLowerCase() ||
        a.slug.toLowerCase() === targetName.toLowerCase()
      );

      if (!app) {
        stream.markdown(`Application "${targetName}" not found.\n`);
        return { metadata: { command: 'destroy', status: 'not-found' } };
      }

      stream.markdown('## ⚠️ Delete Application\n\n');
      stream.markdown(`**Warning:** This will permanently delete the application **${app.name}** and all its environments.\n\n`);
      stream.markdown('### What will be removed:\n');
      stream.markdown('```diff\n');
      stream.markdown(`- Application: ${app.name}\n`);
      stream.markdown(`- All environments and deployments\n`);
      stream.markdown(`- All environment variables\n`);
      stream.markdown(`- Build cache and logs\n`);
      stream.markdown('```\n\n');
      stream.markdown('This action **cannot be undone**.\n\n');

      stream.button({
        command: 'lightcloud.confirmDestroy',
        title: '🗑️ Confirm Delete',
        arguments: [{ type: 'application', id: app.id, name: app.name, organisationId: organisation.id }],
      });
      stream.button({
        command: 'lightcloud.cancel',
        title: '❌ Cancel',
      });

    } else {
      // Find environment by name across all apps
      for (const app of apps) {
        const envsResult = await this.api.listEnvironments(organisation.id, app.id);
        const environments = envsResult.data || [];

        const env = environments.find(e =>
          e.name.toLowerCase() === targetName.toLowerCase()
        );

        if (env) {
          stream.markdown('## ⚠️ Delete Environment\n\n');
          stream.markdown(`**Warning:** This will permanently delete the **${env.name}** environment.\n\n`);
          stream.markdown('### What will be removed:\n');
          stream.markdown('```diff\n');
          stream.markdown(`- Environment: ${env.name}${env.url ? ` (${env.url})` : ''}\n`);
          stream.markdown(`- Environment variables\n`);
          stream.markdown(`- Build cache and logs\n`);
          stream.markdown('```\n\n');
          stream.markdown(`The application **${app.name}** and other environments will not be affected.\n\n`);

          stream.button({
            command: 'lightcloud.confirmDestroy',
            title: '🗑️ Confirm Delete',
            arguments: [{ type: 'environment', id: env.id, name: env.name, organisationId: organisation.id }],
          });
          stream.button({
            command: 'lightcloud.cancel',
            title: '❌ Cancel',
          });

          return { metadata: { command: 'destroy', status: 'confirm', target: env.name } };
        }
      }

      stream.markdown(`Environment "${targetName}" not found.\n\n`);
      stream.markdown('To delete an entire application, use:\n');
      stream.markdown('```\n@lightcloud /destroy <app-name> --app\n```\n');
    }

    return { metadata: { command: 'destroy', status: 'confirm' } };
  }
}
