import * as fs from 'node:fs';
import type { AuditRule, AuditFinding, AuditContext } from '../types.js';
import type { McpServer } from '../../inventory/types.js';
import { getClientConfigPath } from '../../utils/paths.js';
import { ALL_CLIENTS } from '../../inventory/types.js';

export const envVarExposureRule: AuditRule = {
  id: 'SEC-003',
  name: 'Config File Permissions',
  description: 'Checks if config files are world-readable',
  severity: 'medium',
  check(_server: McpServer, _context: AuditContext): AuditFinding | null {
    // Check all client config files for world-readable permissions
    for (const client of ALL_CLIENTS) {
      const configPath = getClientConfigPath(client);
      try {
        const stats = fs.statSync(configPath);
        const mode = stats.mode;
        // Check if world-readable (others have read permission)
        const othersRead = (mode & 0o004) !== 0;
        if (othersRead) {
          return {
            ruleId: 'SEC-003',
            serverId: _server.id,
            severity: 'medium',
            title: `Config file world-readable`,
            description: `${configPath} has permissions ${(mode & 0o777).toString(8)} — readable by other users.`,
            remediation: `Restrict file permissions to owner-only: chmod 600 ${configPath}`,
            evidence: `${configPath} (permissions: ${(mode & 0o777).toString(8)})`,
          };
        }
      } catch {
        // File doesn't exist — skip
      }
    }
    return null;
  },
};
