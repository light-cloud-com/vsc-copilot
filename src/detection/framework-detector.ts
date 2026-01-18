// src/detection/framework-detector.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DetectedProject, Framework, Runtime } from '../api/types';

interface PackageJson {
  name?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

export class FrameworkDetector {
  async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<DetectedProject> {
    const rootPath = workspaceFolder.uri.fsPath;
    const result: DetectedProject = {
      deploymentType: 'static',
    };

    // Check for package.json (Node.js projects)
    const packageJsonPath = path.join(rootPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as PackageJson;
      this.detectFromPackageJson(packageJson, result);
    }

    // Check for requirements.txt or pyproject.toml (Python projects)
    const requirementsPath = path.join(rootPath, 'requirements.txt');
    const pyprojectPath = path.join(rootPath, 'pyproject.toml');
    if (fs.existsSync(requirementsPath) || fs.existsSync(pyprojectPath)) {
      this.detectPythonProject(rootPath, result);
    }

    // Check for go.mod (Go projects)
    const goModPath = path.join(rootPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      result.runtime = 'go';
      result.deploymentType = 'container';
    }

    // Check for Dockerfile
    const dockerfilePath = path.join(rootPath, 'Dockerfile');
    result.hasDockerfile = fs.existsSync(dockerfilePath);
    if (result.hasDockerfile) {
      result.deploymentType = 'container';
    }

    // Detect env files
    result.envFiles = this.findEnvFiles(rootPath);

    return result;
  }

  private detectFromPackageJson(packageJson: PackageJson, result: DetectedProject): void {
    const deps: Record<string, string> = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    result.packageManager = this.detectPackageManager(packageJson);

    // Next.js
    if (deps['next']) {
      result.framework = 'nextjs';
      result.runtime = 'nodejs';
      result.buildCommand = 'npm run build';
      result.startCommand = 'npm start';
      result.deploymentType = 'container'; // Default to SSR
      return;
    }

    // React (Create React App or Vite)
    if (deps['react']) {
      result.framework = 'react';
      result.runtime = 'nodejs';
      result.deploymentType = 'static';

      if (deps['vite']) {
        result.buildCommand = 'npm run build';
        result.outputDirectory = 'dist';
      } else {
        result.buildCommand = 'npm run build';
        result.outputDirectory = 'build';
      }
      return;
    }

    // Vue
    if (deps['vue']) {
      result.framework = 'vue';
      result.runtime = 'nodejs';
      result.deploymentType = 'static';
      result.buildCommand = 'npm run build';
      result.outputDirectory = 'dist';
      return;
    }

    // Angular
    if (deps['@angular/core']) {
      result.framework = 'angular';
      result.runtime = 'nodejs';
      result.deploymentType = 'static';
      result.buildCommand = 'npm run build';
      result.outputDirectory = 'dist';
      return;
    }

    // Svelte
    if (deps['svelte']) {
      result.framework = 'svelte';
      result.runtime = 'nodejs';
      result.deploymentType = 'static';
      result.buildCommand = 'npm run build';
      result.outputDirectory = 'build';
      return;
    }

    // Express
    if (deps['express']) {
      result.framework = 'express';
      result.runtime = 'nodejs';
      result.deploymentType = 'container';
      result.startCommand = packageJson.scripts?.start || 'node index.js';
      return;
    }

    // Default Node.js
    if (packageJson.main || packageJson.scripts?.start) {
      result.runtime = 'nodejs';
      result.deploymentType = 'container';
      result.startCommand = packageJson.scripts?.start || `node ${packageJson.main || 'index.js'}`;
    }
  }

  private detectPythonProject(rootPath: string, result: DetectedProject): void {
    result.runtime = 'python';
    result.deploymentType = 'container';

    // Check for FastAPI
    const requirementsPath = path.join(rootPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      const requirements = fs.readFileSync(requirementsPath, 'utf-8');

      if (requirements.includes('fastapi')) {
        result.framework = 'fastapi';
        result.startCommand = 'uvicorn main:app --host 0.0.0.0 --port $PORT';

        // Detect database dependencies
        if (requirements.includes('sqlalchemy') || requirements.includes('asyncpg') || requirements.includes('psycopg')) {
          result.detectedDependencies = result.detectedDependencies || [];
          result.detectedDependencies.push('postgresql');
        }
      } else if (requirements.includes('flask')) {
        result.framework = 'flask';
        result.startCommand = 'gunicorn app:app --bind 0.0.0.0:$PORT';
      } else if (requirements.includes('django')) {
        result.startCommand = 'gunicorn myproject.wsgi --bind 0.0.0.0:$PORT';
      }
    }
  }

  private detectPackageManager(packageJson: PackageJson): 'npm' | 'yarn' | 'pnpm' {
    if (packageJson.packageManager) {
      if (packageJson.packageManager.startsWith('yarn')) return 'yarn';
      if (packageJson.packageManager.startsWith('pnpm')) return 'pnpm';
    }
    return 'npm';
  }

  private findEnvFiles(rootPath: string): string[] {
    const envFiles: string[] = [];
    const candidates = ['.env', '.env.example', '.env.local', '.env.development', '.env.production'];

    for (const file of candidates) {
      if (fs.existsSync(path.join(rootPath, file))) {
        envFiles.push(file);
      }
    }

    return envFiles;
  }
}
