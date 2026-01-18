// src/detection/git-detector.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitInfo } from '../api/types';

export class GitDetector {
  async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<GitInfo> {
    const rootPath = workspaceFolder.uri.fsPath;
    const gitDir = path.join(rootPath, '.git');

    // Check if .git exists
    if (!fs.existsSync(gitDir)) {
      return { hasGit: false, isGitHub: false };
    }

    // Read git config to get remote
    const configPath = path.join(gitDir, 'config');
    let remoteUrl: string | undefined;
    let branch: string | undefined;

    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');

      // Parse remote origin URL
      const remoteMatch = configContent.match(/\[remote "origin"\][^\[]*url\s*=\s*(.+)/);
      if (remoteMatch) {
        remoteUrl = remoteMatch[1].trim();
      }
    } catch {
      // Could not read git config
    }

    // Get current branch from HEAD
    try {
      const headPath = path.join(gitDir, 'HEAD');
      const headContent = fs.readFileSync(headPath, 'utf-8').trim();
      const branchMatch = headContent.match(/^ref: refs\/heads\/(.+)$/);
      if (branchMatch) {
        branch = branchMatch[1];
      }
    } catch {
      // Could not read HEAD
    }

    // Parse GitHub URL
    const gitHubInfo = this.parseGitHubUrl(remoteUrl);

    return {
      hasGit: true,
      remoteUrl,
      isGitHub: gitHubInfo.isGitHub,
      owner: gitHubInfo.owner,
      repo: gitHubInfo.repo,
      branch,
      isDirty: await this.checkDirty(rootPath),
    };
  }

  private parseGitHubUrl(url?: string): { isGitHub: boolean; owner?: string; repo?: string } {
    if (!url) return { isGitHub: false };

    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
    if (httpsMatch) {
      return {
        isGitHub: true,
        owner: httpsMatch[1],
        repo: httpsMatch[2],
      };
    }

    // SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/git@github\.com:([^\/]+)\/([^\.]+)/);
    if (sshMatch) {
      return {
        isGitHub: true,
        owner: sshMatch[1],
        repo: sshMatch[2],
      };
    }

    return { isGitHub: false };
  }

  private async checkDirty(rootPath: string): Promise<boolean> {
    // Use git status to check for uncommitted changes
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('git status --porcelain', { cwd: rootPath });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}
