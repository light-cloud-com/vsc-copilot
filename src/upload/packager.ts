// src/upload/packager.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_EXCLUDES, parseGitignore } from './excludes';

interface PackageResult {
  buffer: Buffer;
  fileCount: number;
  totalSize: number;
  excludedCount: number;
}

export class SourcePackager {
  async package(
    workspaceFolder: vscode.WorkspaceFolder,
    onProgress?: (message: string) => void
  ): Promise<PackageResult> {
    const rootPath = workspaceFolder.uri.fsPath;

    // Build exclude patterns
    const excludePatterns = [...DEFAULT_EXCLUDES];

    // Add patterns from .gitignore if exists
    const gitignorePath = path.join(rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      excludePatterns.push(...parseGitignore(gitignoreContent));
    }

    onProgress?.('Scanning files...');

    // Collect files to include
    const { files, excludedCount } = await this.collectFiles(rootPath, excludePatterns);

    onProgress?.(`Found ${files.length} files to package`);

    // Create zip archive
    const archiver = await import('archiver');
    const archive = archiver.default('zip', { zlib: { level: 9 } });

    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('error', reject);
      archive.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          buffer,
          fileCount: files.length,
          totalSize: buffer.length,
          excludedCount,
        });
      });

      // Add files to archive
      for (const file of files) {
        const relativePath = path.relative(rootPath, file);
        archive.file(file, { name: relativePath });
      }

      archive.finalize();
    });
  }

  private async collectFiles(
    rootPath: string,
    excludePatterns: string[]
  ): Promise<{ files: string[]; excludedCount: number }> {
    const files: string[] = [];
    let excludedCount = 0;

    const walk = async (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        // Check if excluded
        if (this.shouldExclude(relativePath, entry.name, excludePatterns)) {
          excludedCount++;
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    };

    await walk(rootPath);
    return { files, excludedCount };
  }

  private shouldExclude(
    relativePath: string,
    name: string,
    patterns: string[]
  ): boolean {
    for (const pattern of patterns) {
      // Exact match
      if (pattern === name) return true;

      // Path contains pattern
      if (relativePath.includes(pattern)) return true;

      // Glob pattern *.ext
      if (pattern.startsWith('*') && name.endsWith(pattern.slice(1))) return true;

      // Directory pattern ending with /
      if (pattern.endsWith('/') && relativePath.startsWith(pattern.slice(0, -1))) return true;
    }
    return false;
  }
}
