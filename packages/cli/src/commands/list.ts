import { Command } from 'commander';
import { getDatabase, InventoryManager, type ListOptions } from '@mcpman/core';
import { formatServerTable } from '../formatters/table.js';
import { formatJson } from '../formatters/json.js';

export const listCommand = new Command('list')
  .description('List all servers in the inventory')
  .option('--transport <type>', 'Filter by transport (stdio, sse, streamable-http)')
  .option('--client <client>', 'Filter by client')
  .option('--enabled', 'Show only enabled servers')
  .option('--disabled', 'Show only disabled servers')
  .option('--profile <name>', 'Filter by profile')
  .option('--tags <tags>', 'Filter by tags (comma-separated)')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action((opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);

    const listOpts: ListOptions = {};
    if (opts.transport) listOpts.transport = opts.transport;
    if (opts.client) listOpts.client = opts.client;
    if (opts.enabled) listOpts.enabled = true;
    if (opts.disabled) listOpts.enabled = false;
    if (opts.tags) listOpts.tags = opts.tags.split(',').map((t: string) => t.trim());

    if (opts.profile) {
      const profile = inventory.getProfileByName(opts.profile);
      if (profile) listOpts.profileId = profile.id;
    }

    const servers = inventory.list(listOpts);

    if (opts.format === 'json') {
      console.log(formatJson(servers));
    } else {
      if (servers.length === 0) {
        console.log('No servers found. Add one with: mcpman add');
      } else {
        console.log(formatServerTable(servers));
        const enabled = servers.filter((s) => s.enabled).length;
        const disabled = servers.length - enabled;
        console.log(`\n${servers.length} servers (${enabled} enabled, ${disabled} disabled)`);
      }
    }

    db.close();
  });
