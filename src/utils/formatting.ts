// src/utils/formatting.ts

import { DeploymentStatus } from '../api/types';

export function formatStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    pending: '⏳',
    queued: '⏳',
    building: '🔨',
    deploying: '🚀',
    deployed: '✅',
    healthy: '✅',
    degraded: '⚠️',
    failed: '❌',
    deleting: '🗑️',
  };
  return emojis[status] || '❓';
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `❌ **Error:** ${error.message}\n`;
  }
  return `❌ **Error:** An unknown error occurred\n`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function formatDeploymentSummary(config: {
  name: string;
  framework?: string;
  runtime?: string;
  deploymentType: string;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
}): string {
  const lines: string[] = [
    `**Name:** ${config.name}`,
    `**Type:** ${config.deploymentType}`,
  ];

  if (config.framework) {
    lines.push(`**Framework:** ${config.framework}`);
  }
  if (config.runtime) {
    lines.push(`**Runtime:** ${config.runtime}`);
  }
  if (config.buildCommand) {
    lines.push(`**Build:** \`${config.buildCommand}\``);
  }
  if (config.startCommand) {
    lines.push(`**Start:** \`${config.startCommand}\``);
  }
  if (config.outputDirectory) {
    lines.push(`**Output:** \`${config.outputDirectory}\``);
  }

  return lines.join('\n');
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}
