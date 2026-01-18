// src/commands/upload-deploy.ts

import * as vscode from 'vscode';
import { LightCloudApi } from '../api/endpoints';
import { SourcePackager } from '../upload/packager';
import { SourceUploader } from '../upload/uploader';
import { DetectedProject } from '../api/types';

interface UploadDeployArgs {
  workspaceFolder: string;
  name: string;
  detected: DetectedProject;
  organisationId: string;
}

export class UploadDeployCommand {
  private packager = new SourcePackager();
  private uploader: SourceUploader;

  constructor(private api: LightCloudApi) {
    this.uploader = new SourceUploader(api);
  }

  async execute(
    args: UploadDeployArgs,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      f => f.uri.fsPath === args.workspaceFolder
    );

    if (!workspaceFolder) {
      stream.markdown('Workspace folder not found.\n');
      return { metadata: { command: 'upload-deploy', status: 'error' } };
    }

    // Step 1: Package
    stream.markdown('## 📦 Preparing Upload\n\n');
    stream.progress('Packaging your project...');

    const packageResult = await this.packager.package(workspaceFolder, (msg) => {
      stream.progress(msg);
    });

    const sizeMB = (packageResult.totalSize / 1024 / 1024).toFixed(2);

    stream.markdown(`Packaging complete:\n`);
    stream.markdown(`- Files: ${packageResult.fileCount}\n`);
    stream.markdown(`- Size: ${sizeMB} MB\n`);
    stream.markdown(`- Excluding: node_modules, .git, .env\n\n`);

    // Check size limit
    const maxSizeMB = vscode.workspace.getConfiguration('lightcloud').get('uploadMaxSizeMB') || 100;
    if (packageResult.totalSize > (maxSizeMB as number) * 1024 * 1024) {
      stream.markdown(`⚠️ **Package too large** (${sizeMB} MB > ${maxSizeMB} MB limit)\n\n`);
      stream.markdown('Please exclude more files or use GitHub deployment.\n');
      return { metadata: { command: 'upload-deploy', status: 'too-large' } };
    }

    // Step 2: Upload
    stream.markdown('## ⬆️ Uploading\n\n');
    stream.progress('Uploading source...');

    const uploadResult = await this.uploader.upload(
      args.organisationId,
      packageResult.buffer,
      `${args.name}-source.zip`,
      (progress) => {
        const bar = this.createProgressBar(progress.percentage);
        stream.progress(`Uploading... ${bar} ${progress.percentage}%`);
      }
    );

    if ('error' in uploadResult) {
      stream.markdown(`❌ Upload failed: ${uploadResult.error}\n`);
      stream.button({
        command: 'lightcloud.uploadAndDeploy',
        title: '🔄 Retry',
        arguments: [args],
      });
      return { metadata: { command: 'upload-deploy', status: 'upload-failed' } };
    }

    stream.markdown('✅ Upload complete!\n\n');

    // Step 3: Create application
    stream.markdown('## 🚀 Deploying\n\n');
    stream.progress('Creating application...');

    const createResult = await this.api.createApplicationFromUpload({
      targetOrganisationId: args.organisationId,
      name: args.name,
      uploadId: uploadResult.uploadId,
      deploymentType: args.detected.deploymentType,
      framework: args.detected.framework,
      runtime: args.detected.runtime,
      buildCommand: args.detected.buildCommand,
      startCommand: args.detected.startCommand,
      outputDirectory: args.detected.outputDirectory,
    });

    if (!createResult.success || !createResult.data) {
      stream.markdown(`❌ Deployment failed: ${createResult.error?.message}\n`);
      return { metadata: { command: 'upload-deploy', status: 'deploy-failed' } };
    }

    const app = createResult.data;

    // Step 4: Stream build logs (if enabled)
    const showLogs = vscode.workspace.getConfiguration('lightcloud').get('showBuildLogs');

    if (showLogs && app.environments?.[0]) {
      stream.markdown('🔨 Building... (streaming logs)\n\n');
      stream.markdown('```\n');

      const env = app.environments[0];
      const stopStream = await this.api.streamEnvironmentLogs(
        args.organisationId,
        env.id,
        (log) => {
          stream.markdown(`${log}\n`);
        },
        (error) => {
          stream.markdown(`\nLog stream error: ${error.message}\n`);
        }
      );

      // Wait for deployment to complete (poll status)
      await this.waitForDeployment(args.organisationId, env.id, stream);
      stopStream();

      stream.markdown('```\n\n');
    }

    // Step 5: Show result
    stream.markdown('## ✅ Deployed!\n\n');

    // Show the expected deployed URL (will be active once deployment completes)
    const deployedUrl = (app as any).expectedDeployedUrl || app.url;
    if (deployedUrl) {
      stream.markdown(`🌐 **Site URL:** [${deployedUrl}](${deployedUrl})\n\n`);
    } else {
      stream.markdown(`🌐 **Site URL:** Building... (URL will be available shortly)\n\n`);
    }

    // Show dashboard link
    const dashboardUrl = (app as any).dashboardUrl;
    if (dashboardUrl) {
      stream.markdown(`📊 **Dashboard:** [View in Console](${dashboardUrl})\n\n`);
    }

    stream.markdown('⚠️ **Note:** For automatic deployments on code changes, consider connecting a GitHub repository.\n\n');

    stream.button({
      command: 'lightcloud.connectGitHub',
      title: '🔗 Connect GitHub',
    });
    if (dashboardUrl) {
      stream.button({
        command: 'vscode.open',
        title: '📊 Open Dashboard',
        arguments: [vscode.Uri.parse(dashboardUrl)],
      });
    }

    return { metadata: { command: 'upload-deploy', status: 'success', applicationId: app.id } };
  }

  private createProgressBar(percentage: number): string {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private async waitForDeployment(
    organisationId: string,
    environmentId: string,
    stream: vscode.ChatResponseStream
  ): Promise<void> {
    const maxWaitMs = 5 * 60 * 1000; // 5 minutes
    const pollIntervalMs = 3000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.api.getEnvironment(organisationId, environmentId);

      if (status.data?.status === 'healthy') {
        return;
      }

      if (status.data?.status === 'failed') {
        throw new Error('Deployment failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }
}
