// src/participant.ts

import * as vscode from 'vscode';
import { ApiClient } from './api/client';
import { LightCloudApi } from './api/endpoints';
import { AuthCommands } from './commands/auth';
import { DeployCommand } from './commands/deploy';
import { StatusCommand } from './commands/status';
import { ListCommand } from './commands/list';
import { DestroyCommand } from './commands/destroy';
import { RedeployCommand } from './commands/redeploy';
import { PlanCommand } from './commands/plan';
import { GitDetector } from './detection/git-detector';
import { FrameworkDetector } from './detection/framework-detector';
import { formatError } from './utils/formatting';

export class LightCloudParticipant {
  private client: ApiClient;
  private api: LightCloudApi;
  private auth: AuthCommands;
  private gitDetector: GitDetector;
  private frameworkDetector: FrameworkDetector;

  // Commands
  private deployCommand: DeployCommand;
  private statusCommand: StatusCommand;
  private listCommand: ListCommand;
  private destroyCommand: DestroyCommand;
  private redeployCommand: RedeployCommand;
  private planCommand: PlanCommand;

  constructor(private context: vscode.ExtensionContext) {
    this.client = new ApiClient(context);
    this.api = new LightCloudApi(this.client);
    this.auth = new AuthCommands(this.client, this.api);
    this.gitDetector = new GitDetector();
    this.frameworkDetector = new FrameworkDetector();

    // Initialize commands
    this.deployCommand = new DeployCommand(this.api, this.gitDetector, this.frameworkDetector);
    this.statusCommand = new StatusCommand(this.api);
    this.listCommand = new ListCommand(this.api);
    this.destroyCommand = new DestroyCommand(this.api);
    this.redeployCommand = new RedeployCommand(this.api);
    this.planCommand = new PlanCommand(this.api, this.gitDetector, this.frameworkDetector);
  }

  async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    // Handle login/logout without auth check
    if (request.command === 'login') {
      return await this.handleLogin(stream);
    }
    if (request.command === 'logout') {
      return await this.handleLogout(stream);
    }

    // Check authentication and auto-login if needed
    const isAuthenticated = await this.ensureAuthenticated(stream);

    if (!isAuthenticated) {
      return { metadata: { command: 'login-required' } };
    }

    // Get current workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder && this.requiresWorkspace(request.command)) {
      stream.markdown('Please open a project folder to use Light Cloud.\n');
      return { metadata: { command: 'no-workspace' } };
    }

    // Route to appropriate command handler
    try {
      switch (request.command) {
        case 'deploy':
          return await this.deployCommand.execute(request, stream, token, workspaceFolder!);

        case 'plan':
          return await this.planCommand.execute(request, stream, token, workspaceFolder!);

        case 'status':
          return await this.statusCommand.execute(request, stream, token, workspaceFolder);

        case 'list':
          return await this.listCommand.execute(request, stream, token);

        case 'destroy':
          return await this.destroyCommand.execute(request, stream, token);

        case 'redeploy':
          return await this.redeployCommand.execute(request, stream, token);

        case 'login':
          return await this.handleLogin(stream);

        case 'logout':
          return await this.handleLogout(stream);

        default:
          return await this.handleGeneralQuery(request, stream, workspaceFolder);
      }
    } catch (error) {
      stream.markdown(formatError(error));
      return { metadata: { command: 'error' } };
    }
  }

  private requiresWorkspace(command?: string): boolean {
    return ['deploy', 'plan'].includes(command || '');
  }

  /**
   * Handle /login command
   */
  private async handleLogin(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    // Check if already logged in
    const hasToken = await this.client.isAuthenticated();
    if (hasToken) {
      const profileResult = await this.api.getProfile();
      if (profileResult.success && profileResult.data) {
        stream.markdown(`✅ You're already logged in as **${profileResult.data.email}**\n\n`);
        stream.markdown('Use `/logout` to sign out.\n');
        return { metadata: { command: 'login', status: 'already-logged-in' } };
      }
    }

    stream.markdown('🔐 Opening browser to login...\n\n');

    const success = await this.auth.login();

    if (success) {
      const profileResult = await this.api.getProfile();
      const name = profileResult.data?.first_name || profileResult.data?.email || 'there';
      stream.markdown(`✅ **Welcome, ${name}!**\n\n`);
      stream.markdown('You can now use `/deploy` to deploy your projects.\n');
      return { metadata: { command: 'login', status: 'success' } };
    } else {
      stream.markdown('❌ Login cancelled or failed.\n\n');
      stream.button({
        command: 'lightcloud.login',
        title: '🔑 Try Again',
      });
      return { metadata: { command: 'login', status: 'failed' } };
    }
  }

  /**
   * Handle /logout command
   */
  private async handleLogout(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    const hasToken = await this.client.isAuthenticated();

    if (!hasToken) {
      stream.markdown('You\'re not currently logged in.\n');
      return { metadata: { command: 'logout', status: 'not-logged-in' } };
    }

    await this.auth.logout();
    stream.markdown('✅ **Logged out successfully.**\n\n');
    stream.markdown('Use `/login` to sign in again.\n');
    return { metadata: { command: 'logout', status: 'success' } };
  }

  /**
   * Ensure user is authenticated, auto-triggering login if needed
   */
  private async ensureAuthenticated(stream: vscode.ChatResponseStream): Promise<boolean> {
    // First check if we have a token
    const hasToken = await this.client.isAuthenticated();

    if (hasToken) {
      // Verify token is still valid by fetching profile
      const profileResult = await this.api.getProfile();
      if (profileResult.success && profileResult.data?.organisations?.length) {
        return true; // Token is valid
      }
      // Token exists but is invalid/expired - clear it
      await this.client.clearTokens();
    }

    // Not authenticated - auto-trigger login
    stream.markdown('🔐 **Authentication required**\n\n');
    stream.markdown('Opening browser to login...\n\n');

    // Trigger login flow
    const loginSuccess = await this.auth.login();

    if (loginSuccess) {
      stream.markdown('✅ **Logged in successfully!**\n\n');
      return true;
    } else {
      stream.markdown('❌ Login was cancelled or failed. Please try again.\n\n');
      stream.button({
        command: 'lightcloud.login',
        title: '🔑 Try Again',
      });
      return false;
    }
  }

  private async handleGeneralQuery(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    workspaceFolder?: vscode.WorkspaceFolder
  ): Promise<vscode.ChatResult> {
    const prompt = request.prompt.toLowerCase();

    // Handle natural language queries
    if (prompt.includes('deploy')) {
      stream.markdown('To deploy your project, use the `/deploy` command:\n\n');
      stream.markdown('```\n@lightcloud /deploy\n```\n\n');
      stream.markdown('Or tell me more about what you want to deploy!\n');
    } else if (prompt.includes('status')) {
      stream.markdown('To check your application status, use:\n\n');
      stream.markdown('```\n@lightcloud /status\n```\n');
    } else if (prompt.includes('help')) {
      this.showHelp(stream);
    } else {
      stream.markdown('I can help you deploy and manage your applications on Light Cloud.\n\n');
      stream.markdown('**Available commands:**\n');
      stream.markdown('- `/deploy` - Deploy your project\n');
      stream.markdown('- `/plan` - Preview deployment configuration\n');
      stream.markdown('- `/status` - Check deployment status\n');
      stream.markdown('- `/list` - List all applications\n');
      stream.markdown('- `/redeploy` - Redeploy current environment\n');
      stream.markdown('- `/destroy` - Delete an application or environment\n');
      stream.markdown('- `/login` - Login to Light Cloud\n');
      stream.markdown('- `/logout` - Logout from Light Cloud\n');
    }

    return { metadata: { command: 'general' } };
  }

  private showHelp(stream: vscode.ChatResponseStream): void {
    stream.markdown('# Light Cloud Help\n\n');
    stream.markdown('## Commands\n\n');
    stream.markdown('| Command | Description |\n');
    stream.markdown('|---------|-------------|\n');
    stream.markdown('| `/deploy` | Deploy current project to Light Cloud |\n');
    stream.markdown('| `/plan` | Preview deployment configuration |\n');
    stream.markdown('| `/status` | Show application health and status |\n');
    stream.markdown('| `/list` | List all applications and environments |\n');
    stream.markdown('| `/redeploy` | Redeploy current environment |\n');
    stream.markdown('| `/destroy` | Delete an application or environment |\n');
    stream.markdown('| `/login` | Login to Light Cloud |\n');
    stream.markdown('| `/logout` | Logout from Light Cloud |\n');
    stream.markdown('\n## Examples\n\n');
    stream.markdown('```\n@lightcloud /deploy\n@lightcloud /status\n@lightcloud /list\n```\n');
  }
}
