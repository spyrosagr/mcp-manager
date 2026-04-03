import * as path from 'node:path';
import { getPlatform, getHomeDir } from './platform.js';
import type { ClientType } from '../inventory/types.js';

export function getMcpmanDataDir(): string {
  const override = process.env['MCPMAN_DATA_DIR'];
  if (override) return override;
  return path.join(getHomeDir(), '.mcpman');
}

export function getMcpmanDbPath(): string {
  const override = process.env['MCPMAN_DB_PATH'];
  if (override) return override;
  return path.join(getMcpmanDataDir(), 'mcpman.db');
}

export function getMcpmanConfigPath(): string {
  return path.join(getMcpmanDataDir(), 'config.json');
}

export function getRegistryCacheDbPath(): string {
  return path.join(getMcpmanDataDir(), 'registry-cache.db');
}

export function getClientConfigPath(client: ClientType): string {
  const home = getHomeDir();
  const platform = getPlatform();

  switch (client) {
    case 'claude-desktop':
      return getClaudeDesktopConfigPath(home, platform);
    case 'cursor':
      return path.join(home, '.cursor', 'mcp.json');
    case 'vscode':
      return getVSCodeConfigPath(home, platform);
    case 'claude-code':
      return path.join(home, '.claude', 'settings.json');
    case 'cline':
      return getClineConfigPath(home, platform);
    case 'windsurf':
      return path.join(home, '.windsurf', 'mcp.json');
    case 'continue':
      return path.join(home, '.continue', 'config.json');
    case 'zed':
      return getZedConfigPath(home, platform);
  }
}

function getClaudeDesktopConfigPath(home: string, platform: string): string {
  switch (platform) {
    case 'macos':
      return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'windows':
      return path.join(process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
    default: // linux
      return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function getVSCodeConfigPath(home: string, platform: string): string {
  switch (platform) {
    case 'macos':
      return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    case 'windows':
      return path.join(process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json');
    default: // linux
      return path.join(home, '.config', 'Code', 'User', 'settings.json');
  }
}

function getClineConfigPath(home: string, platform: string): string {
  const relativePath = path.join('Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
  switch (platform) {
    case 'macos':
      return path.join(home, 'Library', 'Application Support', relativePath);
    case 'windows':
      return path.join(process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming'), relativePath);
    default: // linux
      return path.join(home, '.config', relativePath);
  }
}

function getZedConfigPath(home: string, platform: string): string {
  switch (platform) {
    case 'windows':
      return path.join(process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming'), 'Zed', 'settings.json');
    default: // macos + linux
      return path.join(home, '.config', 'zed', 'settings.json');
  }
}
