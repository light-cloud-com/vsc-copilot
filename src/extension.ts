// src/extension.ts

import * as vscode from 'vscode';
import { ApiClient } from './api/client';
import { LightCloudApi } from './api/endpoints';
import { LightCloudParticipant } from './participant';
import { AuthCommands } from './commands/auth';
import { GitHubCommands } from './commands/github';
import { UploadDeployCommand } from './commands/upload-deploy';
import { getConfigManager } from './utils/config-manager';

let participant: LightCloudParticipant;

export function activate(context: vscode.ExtensionContext) {
  console.log('Light Cloud extension activating...');

  // Initialize core services
  const client = new ApiClient(context);
  const api = new LightCloudApi(client);
  const auth = new AuthCommands(client, api);
  const github = new GitHubCommands(api);
  const uploadDeploy = new UploadDeployCommand(api);

  // Initialize chat participant
  participant = new LightCloudParticipant(context);

  // Register chat participant
  const chatParticipant = vscode.chat.createChatParticipant(
    'lightcloud.deploy',
    (request, context, stream, token) =>
      participant.handleRequest(request, context, stream, token)
  );

  chatParticipant.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    'resources',
    'icon.png'
  );

  // Register URI handler for auth callback
  // Handles: vscode://lightcloud.lightcloud-copilot/auth-callback?token=xxx&state=xxx
  const uriHandler = vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri) {
      console.log('Received URI:', uri.toString());

      if (uri.path === '/auth-callback') {
        AuthCommands.handleAuthCallback(uri);
      }
    }
  });
  context.subscriptions.push(uriHandler);

  // Register commands
  context.subscriptions.push(
    // Auth commands
    vscode.commands.registerCommand('lightcloud.login', () => auth.login()),
    vscode.commands.registerCommand('lightcloud.logout', () => auth.logout()),

    // GitHub commands
    vscode.commands.registerCommand('lightcloud.connectGitHub', () =>
      github.connectGitHub()
    ),

    vscode.commands.registerCommand('lightcloud.connectGitHubAndDeploy', async (args) => {
      // First check/connect GitHub
      const connected = await github.connectGitHub();

      if (!connected) {
        vscode.window.showErrorMessage('GitHub connection required to deploy.');
        return;
      }

      // GitHub is connected, now deploy
      if (!args?.gitInfo || !args?.detected || !args?.organisationId) {
        vscode.window.showErrorMessage('Missing deployment configuration. Please run /deploy again.');
        return;
      }

      // Create the application from GitHub
      const result = await api.createApplication({
        targetOrganisationId: args.organisationId,
        name: args.name || args.gitInfo.repo,
        githubRepoUrl: `https://github.com/${args.gitInfo.owner}/${args.gitInfo.repo}`,
        githubBranch: args.gitInfo.branch || 'main',
        deploymentType: args.detected.deploymentType,
        framework: args.detected.framework,
        runtime: args.detected.runtime,
        buildCommand: args.detected.buildCommand,
        outputDirectory: args.detected.outputDirectory,
      });

      if (result.success && result.data) {
        const app = result.data as any;
        const prodEnv = app.environments?.find((e: any) => e.is_production) || app.environments?.[0];

        // Save to .lightcloud config
        const configManager = getConfigManager();
        configManager.write({
          organisationId: args.organisationId,
          applicationId: app.id,
          applicationName: app.name,
          environmentId: prodEnv?.id,
          environmentName: prodEnv?.name,
          deploymentType: app.deployment_type,
          framework: app.framework,
          runtime: app.runtime,
          lastDeployedAt: new Date().toISOString(),
        });

        // Build URLs
        const config = vscode.workspace.getConfiguration('lightcloud');
        const consoleUrl = config.get('consoleUrl') || 'https://console.light-cloud.com';
        const dashboardUrl = app.dashboardUrl || `${consoleUrl}/applications/${app.id}/environments/${prodEnv?.id}/overview`;
        const deployedUrl = app.expectedDeployedUrl || prodEnv?.url || prodEnv?.deployed_url;

        // Show success message with URLs
        const message = deployedUrl
          ? `✅ Deployed! ${app.name} is building...\n\n🔗 URL: ${deployedUrl}\n📊 Dashboard: ${dashboardUrl}`
          : `✅ Deployed! ${app.name} is building...\n\n📊 Dashboard: ${dashboardUrl}`;

        const openAction = await vscode.window.showInformationMessage(
          message,
          'Open Dashboard',
          'Open URL'
        );

        if (openAction === 'Open Dashboard') {
          vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
        } else if (openAction === 'Open URL' && deployedUrl) {
          vscode.env.openExternal(vscode.Uri.parse(deployedUrl));
        }
      } else {
        vscode.window.showErrorMessage(`Deployment failed: ${result.error?.message}`);
      }
    }),

    // Deploy commands
    vscode.commands.registerCommand('lightcloud.confirmDeploy', async (config) => {
      if (!config) {
        vscode.window.showErrorMessage('No deployment configuration provided.');
        return;
      }

      // Execute deployment with config
      const result = await api.createApplication({
        targetOrganisationId: config.organisationId,
        name: config.name,
        githubRepoUrl: `https://github.com/${config.gitInfo.owner}/${config.gitInfo.repo}`,
        githubBranch: config.gitInfo.branch || 'main',
        deploymentType: config.detected.deploymentType,
        framework: config.detected.framework,
        runtime: config.detected.runtime,
        buildCommand: config.detected.buildCommand,
        outputDirectory: config.detected.outputDirectory,
      });

      if (result.success && result.data) {
        // Save to .lightcloud config
        const configManager = getConfigManager();
        const app = result.data as any;
        const prodEnv = app.environments?.find((e: any) => e.is_production) || app.environments?.[0];

        configManager.write({
          organisationId: config.organisationId,
          applicationId: app.id,
          applicationName: app.name,
          environmentId: prodEnv?.id,
          environmentName: prodEnv?.name,
          deploymentType: app.deployment_type,
          framework: app.framework,
          runtime: app.runtime,
          lastDeployedAt: new Date().toISOString(),
        });

        // Build URLs
        const vsConfig = vscode.workspace.getConfiguration('lightcloud');
        const consoleUrl = vsConfig.get('consoleUrl') || 'https://console.light-cloud.com';
        const dashboardUrl = app.dashboardUrl || `${consoleUrl}/applications/${app.id}/environments/${prodEnv?.id}/overview`;
        const deployedUrl = app.expectedDeployedUrl || prodEnv?.url || prodEnv?.deployed_url;

        // Show success message with URLs
        const message = deployedUrl
          ? `✅ Deployed! ${app.name} is building...\n\n🔗 URL: ${deployedUrl}\n📊 Dashboard: ${dashboardUrl}`
          : `✅ Deployed! ${app.name} is building...\n\n📊 Dashboard: ${dashboardUrl}`;

        const openAction = await vscode.window.showInformationMessage(
          message,
          'Open Dashboard',
          'Open URL'
        );

        if (openAction === 'Open Dashboard') {
          vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
        } else if (openAction === 'Open URL' && deployedUrl) {
          vscode.env.openExternal(vscode.Uri.parse(deployedUrl));
        }
      } else {
        vscode.window.showErrorMessage(
          `Deployment failed: ${result.error?.message}`
        );
      }
    }),

    vscode.commands.registerCommand('lightcloud.uploadAndDeploy', async (args) => {
      if (!args) {
        args = {};
      }

      // Always ensure we have organisationId - trigger login if needed
      const ensureOrganisation = async (): Promise<string | null> => {
        // First try to get profile
        let profileResult = await api.getProfile();

        // If not authenticated or no orgs, trigger login
        if (!profileResult.success || !profileResult.data?.organisations?.length) {
          vscode.window.showInformationMessage('🔐 Authentication required. Opening browser to login...');
          const loginSuccess = await auth.login();

          if (!loginSuccess) {
            vscode.window.showErrorMessage('Login cancelled. Please try again.');
            return null;
          }

          // Retry getting profile after login
          profileResult = await api.getProfile();
          if (!profileResult.success || !profileResult.data?.organisations?.length) {
            vscode.window.showErrorMessage('Could not fetch organisations. Please try again.');
            return null;
          }
        }

        return profileResult.data.organisations[0].id;
      };

      // Get organisation ID (from args or via login)
      const organisationId = args.organisationId || await ensureOrganisation();
      if (!organisationId) {
        return; // Error already shown
      }
      args.organisationId = organisationId;

      // Ensure we have a name
      if (!args.name) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        args.name = workspaceFolder?.name || 'my-app';
      }

      // Ensure we have workspace folder
      if (!args.workspaceFolder) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('Please open a project folder first.');
          return;
        }
        args.workspaceFolder = workspaceFolder.uri.fsPath;
      }

      // Perform actual upload deployment with progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Light Cloud Deploy',
          cancellable: false,
        },
        async (progress) => {
          try {
            // Import packager and uploader
            const { SourcePackager } = await import('./upload/packager');
            const { SourceUploader } = await import('./upload/uploader');

            const packager = new SourcePackager();
            const uploader = new SourceUploader(api);

            // Step 1: Package (0-30%)
            progress.report({ increment: 0, message: '📦 Packaging project...' });

            const workspaceFolder = vscode.workspace.workspaceFolders?.find(
              f => f.uri.fsPath === args.workspaceFolder
            );

            if (!workspaceFolder) {
              throw new Error('Workspace folder not found');
            }

            const packageResult = await packager.package(workspaceFolder, (msg) => {
              progress.report({ message: `📦 ${msg}` });
            });

            const sizeMB = (packageResult.totalSize / 1024 / 1024).toFixed(2);
            progress.report({ increment: 30, message: `📦 Packaged ${packageResult.fileCount} files (${sizeMB} MB)` });

            // Check size limit
            const maxSizeMB = vscode.workspace.getConfiguration('lightcloud').get('uploadMaxSizeMB') || 100;
            if (packageResult.totalSize > (maxSizeMB as number) * 1024 * 1024) {
              throw new Error(`Package too large (${sizeMB} MB > ${maxSizeMB} MB limit)`);
            }

            // Step 2: Upload (30-70%)
            progress.report({ increment: 0, message: '⬆️ Uploading to Light Cloud...' });

            const uploadResult = await uploader.upload(
              args.organisationId,
              packageResult.buffer,
              `${args.name}-source.zip`,
              (uploadProgress) => {
                const increment = (uploadProgress.percentage / 100) * 40;
                progress.report({
                  increment: increment > 0 ? increment : 0,
                  message: `⬆️ Uploading... ${uploadProgress.percentage}%`
                });
              }
            );

            if ('error' in uploadResult) {
              throw new Error(uploadResult.error);
            }

            progress.report({ increment: 10, message: '⬆️ Upload complete!' });

            // Step 3: Create application (70-100%)
            progress.report({ increment: 0, message: '🚀 Creating application...' });

            const createResult = await api.createApplicationFromUpload({
              targetOrganisationId: args.organisationId,
              name: args.name,
              uploadId: uploadResult.uploadId,
              deploymentType: args.detected?.deploymentType || 'container',
              framework: args.detected?.framework,
              runtime: args.detected?.runtime,
              buildCommand: args.detected?.buildCommand,
              startCommand: args.detected?.startCommand,
              outputDirectory: args.detected?.outputDirectory,
            });

            if (!createResult.success || !createResult.data) {
              throw new Error(createResult.error?.message || 'Failed to create application');
            }

            progress.report({ increment: 20, message: '✅ Deployment started!' });

            // Show success with URL
            const app = createResult.data as any;

            // Save to .lightcloud config
            const configManager = getConfigManager();
            const prodEnv = app.environments?.find((e: any) => e.is_production) || app.environments?.[0];

            configManager.write({
              organisationId: args.organisationId,
              applicationId: app.id,
              applicationName: app.name,
              environmentId: prodEnv?.id,
              environmentName: prodEnv?.name,
              deploymentType: app.deployment_type,
              framework: app.framework,
              runtime: app.runtime,
              lastDeployedAt: new Date().toISOString(),
            });

            // Build URLs
            const vsConfig = vscode.workspace.getConfiguration('lightcloud');
            const consoleUrl = vsConfig.get('consoleUrl') || 'https://console.light-cloud.com';
            const dashboardUrl = app.dashboardUrl || `${consoleUrl}/applications/${app.id}/environments/${prodEnv?.id}/overview`;
            const deployedUrl = app.expectedDeployedUrl || prodEnv?.url || prodEnv?.deployed_url;

            // Show success message with URLs
            const message = deployedUrl
              ? `✅ Deployed! ${app.name} is building...\n\n🔗 URL: ${deployedUrl}\n📊 Dashboard: ${dashboardUrl}`
              : `✅ Deployed! ${app.name} is building...\n\n📊 Dashboard: ${dashboardUrl}`;

            const openAction = await vscode.window.showInformationMessage(
              message,
              'Open Dashboard',
              'Open URL'
            );

            if (openAction === 'Open Dashboard') {
              vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
            } else if (openAction === 'Open URL' && deployedUrl) {
              vscode.env.openExternal(vscode.Uri.parse(deployedUrl));
            }

          } catch (error) {
            vscode.window.showErrorMessage(
              `Deploy failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      );
    }),

    vscode.commands.registerCommand('lightcloud.confirmDestroy', async (args) => {
      const configManager = getConfigManager();

      // If no args provided, try to read from .lightcloud config
      if (!args) {
        const savedConfig = configManager.read();
        if (savedConfig?.applicationId && savedConfig?.organisationId) {
          args = {
            id: savedConfig.applicationId,
            name: savedConfig.applicationName || 'this application',
            organisationId: savedConfig.organisationId,
            type: 'application',
          };
        } else {
          vscode.window.showErrorMessage('No application found. Deploy first or specify an application name.');
          return;
        }
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete ${args.name}?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        let result;
        if (args.type === 'application') {
          result = await api.deleteApplication(args.organisationId, args.id);
        } else {
          result = await api.deleteEnvironment(args.organisationId, args.id);
        }

        if (result.success) {
          // Clear the .lightcloud config after successful delete
          if (args.type === 'application') {
            configManager.clear();
          }
          vscode.window.showInformationMessage(`${args.name} deleted.`);
        } else {
          vscode.window.showErrorMessage(`Delete failed: ${result.error?.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('lightcloud.cancel', () => {
      vscode.window.showInformationMessage('Operation cancelled.');
    }),

    vscode.commands.registerCommand('lightcloud.openDashboard', () => {
      const config = vscode.workspace.getConfiguration('lightcloud');
      const consoleUrl = config.get('consoleUrl') || 'https://console.light-cloud.com';
      vscode.env.openExternal(vscode.Uri.parse(consoleUrl as string));
    }),

    vscode.commands.registerCommand('lightcloud.openLogs', async (args) => {
      // If no args provided, try to read from .lightcloud config
      if (!args?.applicationId || !args?.organisationId) {
        const configManager = getConfigManager();
        const savedConfig = configManager.read();

        if (savedConfig?.applicationId && savedConfig?.organisationId) {
          args = {
            applicationId: savedConfig.applicationId,
            organisationId: savedConfig.organisationId,
          };
        } else {
          vscode.window.showErrorMessage('No application found. Deploy first or specify an application.');
          return;
        }
      }

      // Open logs in output channel
      const outputChannel = vscode.window.createOutputChannel('Light Cloud Logs');
      outputChannel.show();
      outputChannel.appendLine(`Fetching logs for application...`);
      outputChannel.appendLine('');

      // Get environments for the app
      const appResult = await api.getApplication(args.organisationId, args.applicationId);
      if (!appResult.success || !appResult.data?.environments?.length) {
        outputChannel.appendLine('No environments found.');
        return;
      }

      const env = appResult.data.environments[0];
      const result = await api.getEnvironmentLogs(args.organisationId, env.id);

      if (result.success && result.data) {
        for (const log of result.data) {
          outputChannel.appendLine(log);
        }
      } else {
        outputChannel.appendLine('No logs available.');
      }
    }),

    vscode.commands.registerCommand('lightcloud.streamLogs', async (args) => {
      if (!args?.environmentId || !args?.organisationId) {
        vscode.window.showErrorMessage('No environment specified for log streaming.');
        return;
      }

      const outputChannel = vscode.window.createOutputChannel('Light Cloud Live Logs');
      outputChannel.show();
      outputChannel.appendLine('Starting live log stream...');
      outputChannel.appendLine('');

      const stopStream = await api.streamEnvironmentLogs(
        args.organisationId,
        args.environmentId,
        (log) => {
          outputChannel.appendLine(log);
        },
        (error) => {
          outputChannel.appendLine(`Stream error: ${error.message}`);
        }
      );

      // Store stop function for later cleanup
      context.subscriptions.push({
        dispose: () => stopStream()
      });
    }),

    vscode.commands.registerCommand('lightcloud.redeploy', async (args) => {
      // If no args provided, try to read from .lightcloud config
      if (!args?.applicationId || !args?.organisationId) {
        const configManager = getConfigManager();
        const savedConfig = configManager.read();

        if (savedConfig?.applicationId && savedConfig?.organisationId) {
          args = {
            applicationId: savedConfig.applicationId,
            organisationId: savedConfig.organisationId,
          };
        } else {
          vscode.window.showErrorMessage('No application found. Deploy first or specify an application.');
          return;
        }
      }

      const result = await api.deployApplication({
        targetOrganisationId: args.organisationId,
        applicationId: args.applicationId,
      });

      if (result.success) {
        // Update last deployed timestamp
        const configManager = getConfigManager();
        const savedConfig = configManager.read();
        configManager.update({ lastDeployedAt: new Date().toISOString() });

        // Build URLs
        const vsConfig = vscode.workspace.getConfiguration('lightcloud');
        const consoleUrl = vsConfig.get('consoleUrl') || 'https://console.light-cloud.com';
        const dashboardUrl = `${consoleUrl}/applications/${args.applicationId}/environments/${savedConfig?.environmentId}/overview`;

        const openAction = await vscode.window.showInformationMessage(
          `✅ Redeployment started!\n\n📊 Dashboard: ${dashboardUrl}`,
          'Open Dashboard'
        );

        if (openAction === 'Open Dashboard') {
          vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
        }
      } else {
        vscode.window.showErrorMessage(`Redeployment failed: ${result.error?.message}`);
      }
    }),

    vscode.commands.registerCommand('lightcloud.openSettings', async (config) => {
      // Open settings for editing configuration
      vscode.window.showInformationMessage(
        'Configuration editing coming soon. For now, use the /plan command to preview settings.'
      );
    }),

    // Cleanup
    chatParticipant
  );

  console.log('Light Cloud extension activated!');
}

export function deactivate() {
  console.log('Light Cloud extension deactivated');
}
