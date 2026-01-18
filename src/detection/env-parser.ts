// src/detection/env-parser.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface EnvVariable {
  key: string;
  value?: string;
  hasValue: boolean;
}

export class EnvParser {
  parse(workspaceFolder: vscode.WorkspaceFolder, fileName: string = '.env.example'): EnvVariable[] {
    const filePath = path.join(workspaceFolder.uri.fsPath, fileName);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const variables: EnvVariable[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
      if (match) {
        const [, key, value] = match;
        variables.push({
          key,
          value: value || undefined,
          hasValue: !!value && !value.includes('your_') && !value.includes('xxx'),
        });
      }
    }

    return variables;
  }

  parseEnvFile(workspaceFolder: vscode.WorkspaceFolder): Record<string, string> {
    const variables = this.parse(workspaceFolder, '.env');
    const result: Record<string, string> = {};

    for (const v of variables) {
      if (v.value) {
        result[v.key] = v.value;
      }
    }

    return result;
  }
}
