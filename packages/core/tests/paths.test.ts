import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';

// We need to mock platform before importing paths
describe('Path Resolution', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = { ...originalEnv };
  });

  function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  describe('getMcpmanDataDir', () => {
    it('uses MCPMAN_DATA_DIR env override', async () => {
      process.env['MCPMAN_DATA_DIR'] = '/custom/data';
      // Re-import to get fresh module with new env
      const { getMcpmanDataDir } = await import('../src/utils/paths.js');
      expect(getMcpmanDataDir()).toBe('/custom/data');
    });

    it('defaults to ~/.mcpman', async () => {
      delete process.env['MCPMAN_DATA_DIR'];
      const { getMcpmanDataDir } = await import('../src/utils/paths.js');
      const result = getMcpmanDataDir();
      expect(result).toContain('.mcpman');
    });
  });

  describe('getMcpmanDbPath', () => {
    it('uses MCPMAN_DB_PATH env override', async () => {
      process.env['MCPMAN_DB_PATH'] = '/custom/db.sqlite';
      const { getMcpmanDbPath } = await import('../src/utils/paths.js');
      expect(getMcpmanDbPath()).toBe('/custom/db.sqlite');
    });
  });

  describe('getClientConfigPath', () => {
    it('returns correct path for claude-desktop on linux', async () => {
      setPlatform('linux');
      process.env['HOME'] = '/home/testuser';
      const { getClientConfigPath } = await import('../src/utils/paths.js');
      const result = getClientConfigPath('claude-desktop');
      expect(result).toBe('/home/testuser/.config/Claude/claude_desktop_config.json');
    });

    it('returns correct path for cursor (cross-platform)', async () => {
      process.env['HOME'] = '/home/testuser';
      const { getClientConfigPath } = await import('../src/utils/paths.js');
      const result = getClientConfigPath('cursor');
      expect(result).toContain('.cursor');
      expect(result).toContain('mcp.json');
    });

    it('returns correct path for claude-code', async () => {
      process.env['HOME'] = '/home/testuser';
      const { getClientConfigPath } = await import('../src/utils/paths.js');
      const result = getClientConfigPath('claude-code');
      expect(result).toContain('.claude');
      expect(result).toContain('settings.json');
    });

    it('returns correct path for windsurf', async () => {
      process.env['HOME'] = '/home/testuser';
      const { getClientConfigPath } = await import('../src/utils/paths.js');
      const result = getClientConfigPath('windsurf');
      expect(result).toContain('.windsurf');
      expect(result).toContain('mcp.json');
    });

    it('returns correct path for continue', async () => {
      process.env['HOME'] = '/home/testuser';
      const { getClientConfigPath } = await import('../src/utils/paths.js');
      const result = getClientConfigPath('continue');
      expect(result).toContain('.continue');
      expect(result).toContain('config.json');
    });

    it('returns correct path for zed on linux', async () => {
      setPlatform('linux');
      process.env['HOME'] = '/home/testuser';
      const { getClientConfigPath } = await import('../src/utils/paths.js');
      const result = getClientConfigPath('zed');
      expect(result).toBe('/home/testuser/.config/zed/settings.json');
    });

    it('returns correct path for vscode on linux', async () => {
      setPlatform('linux');
      process.env['HOME'] = '/home/testuser';
      const { getClientConfigPath } = await import('../src/utils/paths.js');
      const result = getClientConfigPath('vscode');
      expect(result).toBe('/home/testuser/.config/Code/User/settings.json');
    });

    it('returns correct path for cline on linux', async () => {
      setPlatform('linux');
      process.env['HOME'] = '/home/testuser';
      const { getClientConfigPath } = await import('../src/utils/paths.js');
      const result = getClientConfigPath('cline');
      expect(result).toContain('saoudrizwan.claude-dev');
      expect(result).toContain('cline_mcp_settings.json');
    });
  });
});
