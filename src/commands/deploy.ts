// src/commands/deploy.ts

import * as vscode from 'vscode';
import { LightCloudApi } from '../api/endpoints';
import { GitDetector } from '../detection/git-detector';
import { FrameworkDetector } from '../detection/framework-detector';
import { DetectedProject, GitInfo } from '../api/types';

export class DeployCommand {

  constructor(
    private api: LightCloudApi,
    private gitDetector: GitDetector,
    private frameworkDetector: FrameworkDetector
  ) {}

  async execute(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    workspaceFolder: vscode.WorkspaceFolder
  ): Promise<vscode.ChatResult> {
    stream.progress('Analyzing project...');

    // Step 1: Detect git info
    const gitInfo = await this.gitDetector.detect(workspaceFolder);

    // Step 2: Detect framework
    const detected = await this.frameworkDetector.detect(workspaceFolder);

    // Step 3: Get user profile for organisation
    const profileResult = await this.api.getProfile();
    if (!profileResult.success || !profileResult.data?.organisations?.length) {
      stream.markdown('Could not fetch your organisations. Please check your login.\n');
      return { metadata: { command: 'deploy', status: 'error' } };
    }

    const organisation = profileResult.data.organisations[0]; // Default to first org

    // Step 4: Determine deployment path
    if (gitInfo.isGitHub) {
      return this.handleGitHubDeploy(stream, token, workspaceFolder, gitInfo, detected, organisation.id);
    } else {
      return this.handleLocalDeploy(stream, token, workspaceFolder, gitInfo, detected, organisation.id);
    }
  }

  private async handleGitHubDeploy(
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    workspaceFolder: vscode.WorkspaceFolder,
    gitInfo: GitInfo,
    detected: DetectedProject,
    organisationId: string
  ): Promise<vscode.ChatResult> {
    // Check if GitHub is connected by listing installations
    const installationsResult = await this.api.listGitHubInstallations();
    const installations = (installationsResult.data as any)?.installations || [];
    const isGitHubConnected = installationsResult.success && installations.length > 0;

    if (!isGitHubConnected) {
      // GitHub not connected - show options
      stream.markdown('## 📋 Project Analysis\n\n');
      stream.markdown(`**Detected:** ${detected.framework || detected.runtime || 'Unknown'} application\n`);
      stream.markdown(`**Repository:** github.com/${gitInfo.owner}/${gitInfo.repo}\n`);
      stream.markdown(`**Branch:** ${gitInfo.branch || 'main'}\n\n`);
      stream.markdown('⚠️ **GitHub not connected**\n\n');
      stream.markdown('To deploy from GitHub, Light Cloud needs access to your repository.\n\n');

      stream.button({
        command: 'lightcloud.connectGitHubAndDeploy',
        title: '🔗 Connect GitHub & Deploy',
        arguments: [{
          workspaceFolder: workspaceFolder.uri.fsPath,
          name: gitInfo.repo || workspaceFolder.name,
          gitInfo,
          detected,
          organisationId,
        }],
      });
      stream.button({
        command: 'lightcloud.uploadAndDeploy',
        title: '📤 Upload instead',
        arguments: [{
          workspaceFolder: workspaceFolder.uri.fsPath,
          name: gitInfo.repo || workspaceFolder.name,
          detected,
          organisationId,
        }],
      });

      return { metadata: { command: 'deploy', status: 'github-required' } };
    }

    // Check if the GitHub account (owner) has the app installed and linked
    const repoAccess = await this.api.checkRepoAccess(organisationId, [gitInfo.owner!]);
    const accountStatus = repoAccess.data?.accounts?.[gitInfo.owner!];

    if (!repoAccess.success || !accountStatus?.installed || !accountStatus?.linkedToThisOrg) {
      stream.markdown('## ⚠️ Repository Not Accessible\n\n');
      stream.markdown(`The GitHub account \`${gitInfo.owner}\` is not linked to your organisation.\n\n`);
      stream.markdown('Please install the GitHub App for this account.\n\n');

      stream.button({
        command: 'lightcloud.connectGitHub',
        title: '🔗 Add GitHub Account',
      });

      return { metadata: { command: 'deploy', status: 'repo-not-accessible' } };
    }

    // Show deployment info
    stream.markdown('## 🚀 Deploying...\n\n');
    stream.markdown(`**Project:** ${this.formatFramework(detected)}\n`);
    stream.markdown(`**Source:** github.com/${gitInfo.owner}/${gitInfo.repo} (${gitInfo.branch} branch)\n\n`);

    stream.progress('Creating application...');

    // Actually deploy
    const result = await this.api.createApplication({
      targetOrganisationId: organisationId,
      name: gitInfo.repo!,
      githubRepoUrl: `https://github.com/${gitInfo.owner}/${gitInfo.repo}`,
      githubBranch: gitInfo.branch || 'main',
      deploymentType: detected.deploymentType,
      framework: detected.framework,
      runtime: detected.runtime,
      buildCommand: detected.buildCommand,
      outputDirectory: detected.outputDirectory,
    });

    if (!result.success || !result.data) {
      stream.markdown(`❌ **Deployment failed:** ${result.error?.message || 'Unknown error'}\n`);
      return { metadata: { command: 'deploy', status: 'error' } };
    }

    const app = result.data as any;
    const prodEnv = app.environments?.find((e: any) => e.is_production) || app.environments?.[0];

    // Get URLs from response
    const deployedUrl = app.expectedDeployedUrl || prodEnv?.url || prodEnv?.deployed_url;
    const dashboardUrl = app.dashboardUrl;

    // Show success with URLs
    stream.markdown('## ✅ Deployment Started!\n\n');
    stream.markdown(`**Application:** ${app.name}\n`);
    stream.markdown(`**Status:** ${app.status}\n\n`);

    if (deployedUrl) {
      stream.markdown(`🔗 **URL:** ${deployedUrl}\n\n`);
    }
    if (dashboardUrl) {
      stream.markdown(`📊 **Dashboard:** ${dashboardUrl}\n\n`);
    }

    stream.markdown('Your application is now building. Use `/status` to check progress.\n\n');

    // Action buttons
    stream.button({
      command: 'lightcloud.redeploy',
      title: '🔄 Redeploy',
      arguments: [{ applicationId: app.id, organisationId }],
    });

    return { metadata: { command: 'deploy', status: 'success', applicationId: app.id } };
  }

  private async handleLocalDeploy(
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    workspaceFolder: vscode.WorkspaceFolder,
    gitInfo: GitInfo,
    detected: DetectedProject,
    organisationId: string
  ): Promise<vscode.ChatResult> {
    const folderName = workspaceFolder.name;

    stream.markdown('## 📋 Project Analysis\n\n');
    stream.markdown(`**Detected:** ${this.formatFramework(detected)}\n`);
    stream.markdown(`**Location:** ${workspaceFolder.uri.fsPath}\n\n`);
    stream.markdown('⚠️ No GitHub repository detected.\n\n');
    stream.markdown('How would you like to deploy?\n\n');

    stream.button({
      command: 'lightcloud.uploadAndDeploy',
      title: '📤 Upload source directly',
      arguments: [{
        workspaceFolder: workspaceFolder.uri.fsPath,
        name: folderName,
        detected,
        organisationId,
      }],
    });
    stream.button({
      command: 'lightcloud.connectGitHub',
      title: '🔗 Connect to GitHub first',
    });

    return { metadata: { command: 'deploy', status: 'local-folder' } };
  }

  private formatFramework(detected: DetectedProject): string {
    if (detected.framework) {
      const frameworkNames: Record<string, string> = {
        react: 'React',
        nextjs: 'Next.js',
        vue: 'Vue.js',
        angular: 'Angular',
        svelte: 'Svelte',
        express: 'Express.js',
        fastapi: 'FastAPI',
        flask: 'Flask',
      };
      return `${frameworkNames[detected.framework] || detected.framework} application`;
    }
    if (detected.runtime) {
      const runtimeNames: Record<string, string> = {
        nodejs: 'Node.js',
        python: 'Python',
        go: 'Go',
      };
      return `${runtimeNames[detected.runtime] || detected.runtime} application`;
    }
    return 'Unknown project type';
  }
}
