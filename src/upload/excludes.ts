// src/upload/excludes.ts

export const DEFAULT_EXCLUDES = [
  // Dependencies
  'node_modules',
  'vendor',
  '__pycache__',
  'venv',
  '.venv',
  'env',
  '.env',

  // Build outputs
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',

  // Version control
  '.git',
  '.svn',
  '.hg',

  // IDE
  '.idea',
  '.vscode',
  '*.swp',
  '*.swo',

  // OS
  '.DS_Store',
  'Thumbs.db',

  // Logs
  '*.log',
  'logs',

  // Secrets (be extra careful)
  '.env',
  '.env.local',
  '.env.*.local',
  '*.pem',
  '*.key',
  'credentials.json',
  'secrets.json',
];

export function parseGitignore(content: string): string[] {
  const patterns: string[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Handle negation (we'll ignore these for simplicity)
    if (trimmed.startsWith('!')) continue;

    patterns.push(trimmed);
  }

  return patterns;
}
