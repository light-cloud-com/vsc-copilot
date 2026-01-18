// src/commands/plan.ts

import * as vscode from 'vscode';
import { LightCloudApi } from '../api/endpoints';
import { GitDetector } from '../detection/git-detector';
import { FrameworkDetector } from '../detection/framework-detector';
import { EnvParser } from '../detection/env-parser';
import { DetectedProject, GitInfo } from '../api/types';

export class PlanCommand {
  private envParser = new EnvParser();

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
    stream.progress('Analyzing project for deployment plan...');

    // Detect git info
    const gitInfo = await this.gitDetector.detect(workspaceFolder);

    // Detect framework
    const detected = await this.frameworkDetector.detect(workspaceFolder);

    // Parse env variables
    const envVars = this.envParser.parse(workspaceFolder, '.env.example');
    const hasEnvFile = envVars.length > 0;

    // Get user profile
    const profileResult = await this.api.getProfile();
    if (!profileResult.success || !profileResult.data?.organisations?.length) {
      stream.markdown('Could not fetch your organisations. Please check your login.\n');
      return { metadata: { command: 'plan', status: 'error' } };
    }

    const organisation = profileResult.data.organisations[0];

    // Build the plan
    stream.markdown('## 📋 Deployment Plan\n\n');

    // Source information
    stream.markdown('### Source\n\n');
    if (gitInfo.isGitHub) {
      stream.markdown(`- **Repository:** github.com/${gitInfo.owner}/${gitInfo.repo}\n`);
      stream.markdown(`- **Branch:** ${gitInfo.branch || 'main'}\n`);
      stream.markdown(`- **Method:** GitHub integration\n`);
      if (gitInfo.isDirty) {
        stream.markdown('- ⚠️ **Warning:** You have uncommitted changes\n');
      }
    } else if (gitInfo.hasGit) {
      stream.markdown(`- **Repository:** ${gitInfo.remoteUrl || 'No remote'}\n`);
      stream.markdown(`- **Method:** Source upload (non-GitHub remote)\n`);
    } else {
      stream.markdown(`- **Location:** ${workspaceFolder.uri.fsPath}\n`);
      stream.markdown(`- **Method:** Source upload (no git)\n`);
    }

    // Project detection
    stream.markdown('\n### Detected Configuration\n\n');
    stream.markdown('```yaml\n');
    stream.markdown(`name: ${gitInfo.repo || workspaceFolder.name}\n`);
    stream.markdown(`framework: ${detected.framework || 'auto-detect'}\n`);
    stream.markdown(`runtime: ${detected.runtime || 'auto-detect'}\n`);
    stream.markdown(`type: ${detected.deploymentType}\n`);
    if (detected.buildCommand) {
      stream.markdown(`build_command: ${detected.buildCommand}\n`);
    }
    if (detected.startCommand) {
      stream.markdown(`start_command: ${detected.startCommand}\n`);
    }
    if (detected.outputDirectory) {
      stream.markdown(`output_directory: ${detected.outputDirectory}\n`);
    }
    stream.markdown('```\n\n');

    // Changes preview (diff style)
    stream.markdown('### What Will Happen\n\n');
    stream.markdown('```diff\n');
    stream.markdown(`+ Application: ${gitInfo.repo || workspaceFolder.name} will be created\n`);
    stream.markdown(`+ Environment: production will be created\n`);
    if (detected.deploymentType === 'static') {
      stream.markdown(`+ Static site will be built and deployed to CDN\n`);
    } else {
      stream.markdown(`+ Container will be built and deployed to Cloud Run\n`);
    }
    if (detected.detectedDependencies?.includes('postgresql')) {
      stream.markdown(`? Database: PostgreSQL detected - would you like to provision one?\n`);
    }
    stream.markdown('```\n\n');

    // Environment variables
    if (hasEnvFile) {
      stream.markdown('### Environment Variables\n\n');
      stream.markdown(`Found ${envVars.length} variables in \`.env.example\`:\n\n`);
      stream.markdown('| Variable | Status |\n');
      stream.markdown('|----------|--------|\n');
      for (const v of envVars.slice(0, 10)) {
        const status = v.hasValue ? '✅ Has value' : '⚠️ Needs value';
        stream.markdown(`| \`${v.key}\` | ${status} |\n`);
      }
      if (envVars.length > 10) {
        stream.markdown(`| ... and ${envVars.length - 10} more | |\n`);
      }
      stream.markdown('\n');
    }

    // Organisation
    stream.markdown('### Target\n\n');
    stream.markdown(`- **Organisation:** ${organisation.name}\n`);
    stream.markdown(`- **Region:** auto (closest to you)\n\n`);

    // Action buttons
    stream.button({
      command: 'lightcloud.confirmDeploy',
      title: '✅ Deploy Now',
      arguments: [{
        name: gitInfo.repo || workspaceFolder.name,
        gitInfo,
        detected,
        organisationId: organisation.id,
      }],
    });

    stream.markdown('\n*This plan shows what will be created. Use `/deploy` to proceed.*\n');

    return {
      metadata: {
        command: 'plan',
        status: 'success',
        config: {
          gitInfo,
          detected,
          organisationId: organisation.id,
        }
      }
    };
  }
}
