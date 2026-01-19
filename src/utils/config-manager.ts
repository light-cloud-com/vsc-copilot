// src/utils/config-manager.ts

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface LightCloudConfig {
  organisationId?: string;
  organisationName?: string;
  applicationId?: string;
  applicationName?: string;
  environmentId?: string;
  environmentName?: string;
  deploymentType?: 'static' | 'container';
  framework?: string;
  runtime?: string;
  lastDeployedAt?: string;
}

const CONFIG_FILENAME = '.lightcloud';

export class ConfigManager {
  // Always get workspace root dynamically to handle folder changes
  private getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private getConfigPath(): string | undefined {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      return undefined;
    }
    return path.join(workspaceRoot, CONFIG_FILENAME);
  }

  /**
   * Read the .lightcloud config file from the workspace root
   */
  read(): LightCloudConfig | null {
    const configPath = this.getConfigPath();
    if (!configPath) {
      return null;
    }

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as LightCloudConfig;
      }
    } catch (error) {
      console.error('Failed to read .lightcloud config:', error);
    }

    return null;
  }

  /**
   * Write/update the .lightcloud config file
   */
  write(config: Partial<LightCloudConfig>): boolean {
    const configPath = this.getConfigPath();
    if (!configPath) {
      console.error('No workspace folder open - cannot save .lightcloud config');
      vscode.window.showWarningMessage('No workspace folder open. .lightcloud config was not saved. Open a folder and redeploy to enable /redeploy.');
      return false;
    }

    try {
      // Merge with existing config
      const existingConfig = this.read() || {};
      const newConfig: LightCloudConfig = {
        ...existingConfig,
        ...config,
      };

      // Remove undefined values
      Object.keys(newConfig).forEach((key) => {
        if (newConfig[key as keyof LightCloudConfig] === undefined) {
          delete newConfig[key as keyof LightCloudConfig];
        }
      });

      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n', 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to write .lightcloud config:', error);
      return false;
    }
  }

  /**
   * Update specific fields in the config
   */
  update(updates: Partial<LightCloudConfig>): boolean {
    return this.write(updates);
  }

  /**
   * Save organisation context after login
   */
  saveOrganisation(organisationId: string, organisationName: string): boolean {
    return this.write({
      organisationId,
      organisationName,
    });
  }

  /**
   * Save application context after deploy
   */
  saveApplication(
    applicationId: string,
    applicationName: string,
    options?: {
      environmentId?: string;
      environmentName?: string;
      deploymentType?: 'static' | 'container';
      framework?: string;
      runtime?: string;
    }
  ): boolean {
    return this.write({
      applicationId,
      applicationName,
      environmentId: options?.environmentId,
      environmentName: options?.environmentName,
      deploymentType: options?.deploymentType,
      framework: options?.framework,
      runtime: options?.runtime,
      lastDeployedAt: new Date().toISOString(),
    });
  }

  /**
   * Clear the config file (e.g., after destroy)
   */
  clear(): boolean {
    const configPath = this.getConfigPath();
    if (!configPath) {
      return false;
    }

    try {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
      return true;
    } catch (error) {
      console.error('Failed to clear .lightcloud config:', error);
      return false;
    }
  }

  /**
   * Check if config exists
   */
  exists(): boolean {
    const configPath = this.getConfigPath();
    return configPath ? fs.existsSync(configPath) : false;
  }

  /**
   * Get organisation ID from config or return null
   */
  getOrganisationId(): string | null {
    return this.read()?.organisationId || null;
  }

  /**
   * Get application ID from config or return null
   */
  getApplicationId(): string | null {
    return this.read()?.applicationId || null;
  }

  /**
   * Get environment ID from config or return null
   */
  getEnvironmentId(): string | null {
    return this.read()?.environmentId || null;
  }
}

// Singleton instance
let configManagerInstance: ConfigManager | null = null;

export function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager();
  }
  return configManagerInstance;
}
