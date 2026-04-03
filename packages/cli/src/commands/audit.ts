import { Command } from 'commander';
import { getDatabase, InventoryManager, SecurityAuditor } from '@mcpman/core';
import { success, error, spinner, bold } from '../utils/output.js';
import { formatJson } from '../formatters/json.js';

export const auditCommand = new Command('audit')
  .description('Run security audit')
  .argument('[name]', 'Server name (audit all if omitted)')
  .option('--severity <level>', 'Only show findings at or above this severity')
  .option('--json', 'Output raw JSON')
  .option('--profile <name>', 'Only audit servers in profile')
  .action((name, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    const auditor = new SecurityAuditor(db, inventory);

    try {
      let profileId: string | undefined;
      if (opts.profile) {
        const profile = inventory.getProfileByName(opts.profile);
        if (!profile) {
          error(`Profile "${opts.profile}" not found.`);
          process.exitCode = 1;
          return;
        }
        profileId = profile.id;
      }

      const serverIds = name
        ? (() => {
            const server = inventory.getByName(name);
            if (!server) {
              error(`Server "${name}" not found.`);
              process.exitCode = 1;
              return undefined;
            }
            return [server.id];
          })()
        : undefined;

      if (serverIds === undefined && name) return;

      const servers = inventory.list({ enabled: true, profileId });
      const spin = spinner(`Running security audit on ${servers.length} servers...`);
      spin.start();

      const run = auditor.audit({ serverIds, profileId });
      spin.stop();

      if (opts.json) {
        console.log(formatJson(run));
        return;
      }

      console.log(bold('Security Audit Report'));
      console.log('═'.repeat(40));
      console.log();

      if (run.totalFindings === 0) {
        success('No security issues found.');
        return;
      }

      // Group by severity
      const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;
      const colorMap: Record<string, string> = {
        critical: '\x1b[31m',
        high: '\x1b[33m',
        medium: '\x1b[33m',
        low: '\x1b[36m',
        info: '\x1b[90m',
      };
      const reset = '\x1b[0m';

      for (const sev of severities) {
        const findings = run.findings.filter((f) => f.severity === sev);
        if (findings.length === 0) continue;

        console.log(`${colorMap[sev]}${sev.toUpperCase()} (${findings.length})${reset}`);
        for (const finding of findings) {
          console.log(`  ${finding.ruleId}: ${finding.title}`);
          if (finding.evidence) {
            console.log(`    Evidence: ${finding.evidence}`);
          }
          console.log(`    Fix: ${finding.remediation}`);
        }
        console.log();
      }

      console.log(
        `Summary: ${run.criticalCount} critical, ${run.highCount} high, ` +
        `${run.mediumCount} medium, ${run.lowCount} low, ${run.infoCount} info`,
      );
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });
