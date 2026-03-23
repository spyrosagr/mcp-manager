import { Command } from 'commander';
import { getDatabase, InventoryManager, type UpdateServerInput, type ClientType } from '@mcpman/core';
import { success, error } from '../utils/output.js';

export const editCommand = new Command('edit')
  .description("Edit a server's configuration")
  .argument('<name>', 'Server name')
  .option('--display-name <name>', 'New display name')
  .option('--description <desc>', 'New description')
  .option('--command <cmd>', 'New command')
  .option('--args <args>', 'New comma-separated arguments')
  .option('--url <url>', 'New URL')
  .option('--env <env...>', 'Set environment variable (KEY=VALUE)')
  .option('--clients <clients>', 'Set clients (comma-separated)')
  .option('--tags <tags>', 'Set tags (comma-separated)')
  .action((name, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);

    try {
      const server = inventory.getByName(name);
      if (!server) {
        error(`Server "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      const input: UpdateServerInput = {};
      if (opts.displayName) input.displayName = opts.displayName;
      if (opts.description) input.description = opts.description;
      if (opts.command) input.command = opts.command;
      if (opts.args) input.args = opts.args.split(',').map((a: string) => a.trim());
      if (opts.url) input.url = opts.url;
      if (opts.tags) input.tags = opts.tags.split(',').map((t: string) => t.trim());

      if (opts.env) {
        const envVars: Record<string, string> = { ...(server.envVars || {}) };
        for (const e of opts.env) {
          const [key, ...valueParts] = e.split('=');
          if (key) envVars[key] = valueParts.join('=');
        }
        input.envVars = envVars;
      }

      if (opts.clients) {
        input.clients = opts.clients.split(',').map((c: string) => ({
          client: c.trim() as ClientType,
          enabled: true,
        }));
      }

      inventory.update(server.id, input);
      success(`Server "${name}" updated.`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });
