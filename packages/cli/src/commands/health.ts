import { Command } from 'commander';
import Table from 'cli-table3';
import { getDatabase, InventoryManager, HealthChecker } from '@mcpman/core';
import { success, error, warn, spinner, bold } from '../utils/output.js';
import { formatJson } from '../formatters/json.js';

export const healthCommand = new Command('health')
  .description('Run health checks')
  .argument('[name]', 'Server name (check all if omitted)')
  .option('--verbose', 'Show tool/resource/prompt details')
  .option('--timeout <ms>', 'Override default timeout', '10000')
  .option('--json', 'Output raw JSON results')
  .option('--profile <name>', 'Only check servers in profile')
  .action(async (name, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    const checker = new HealthChecker(db, inventory, {
      timeoutMs: parseInt(opts.timeout, 10),
    });

    try {
      if (name) {
        const server = inventory.getByName(name);
        if (!server) {
          error(`Server "${name}" not found.`);
          process.exitCode = 1;
          return;
        }

        const spin = spinner(`Checking ${name}...`);
        spin.start();
        const result = await checker.check(server);
        spin.stop();

        if (opts.json) {
          console.log(formatJson(result));
          return;
        }

        console.log(bold(`Server: ${server.name}${server.displayName ? ` (${server.displayName})` : ''}`));
        console.log(`Status: ${result.status === 'healthy' ? '✓ healthy' : '✗ ' + result.status}`);
        console.log(`Latency: ${result.responseTimeMs}ms`);
        if (result.protocolVersion) console.log(`Protocol: ${result.protocolVersion}`);
        if (result.serverInfo) console.log(`Server Version: ${result.serverInfo.version}`);
        if (result.error) console.log(`Error: ${result.error}`);

        if (opts.verbose && result.tools) {
          console.log(`\nTools (${result.tools.length}):`);
          for (const tool of result.tools) {
            console.log(`  • ${tool.name}${tool.description ? ` — ${tool.description}` : ''}`);
          }
        }

        if (opts.verbose && result.resources && result.resources.length > 0) {
          console.log(`\nResources (${result.resources.length}):`);
          for (const res of result.resources) {
            console.log(`  • ${res.uri} — ${res.name}`);
          }
        }
      } else {
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

        const servers = inventory.list({ enabled: true, profileId });
        if (servers.length === 0) {
          console.log('No servers to check.');
          return;
        }

        const spin = spinner(`Checking ${servers.length} servers...`);
        spin.start();
        const results = await checker.checkAll({ profileId });
        spin.stop();

        if (opts.json) {
          console.log(formatJson(results));
          return;
        }

        const table = new Table({
          head: ['Name', 'Status', 'Latency', 'Protocol', 'Tools', 'Resources', 'Prompts'],
          style: { head: ['cyan'] },
        });

        for (const result of results) {
          const statusIcon = result.status === 'healthy' ? '✓' : '✗';
          table.push([
            result.serverName,
            `${statusIcon} ${result.status}`,
            result.status === 'timeout' ? 'timeout' : `${result.responseTimeMs}ms`,
            result.protocolVersion || '—',
            result.tools?.length?.toString() || '—',
            result.resources?.length?.toString() || '—',
            result.prompts?.length?.toString() || '—',
          ]);
        }

        console.log(table.toString());

        const healthy = results.filter((r) => r.status === 'healthy').length;
        const unhealthy = results.length - healthy;
        console.log(`\n${healthy} healthy, ${unhealthy} unhealthy`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });
