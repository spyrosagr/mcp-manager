import { Command } from 'commander';
import { getDatabase, InventoryManager, type CreateServerInput, type ClientType } from '@mcpman/core';
import { success, error } from '../utils/output.js';
import { promptServerDetails } from '../utils/interactive.js';

export const addCommand = new Command('add')
  .description('Add an MCP server to the inventory')
  .argument('[name]', 'Server name')
  .option('--transport <type>', 'Transport type: stdio, sse, streamable-http')
  .option('--command <cmd>', 'Command for STDIO servers')
  .option('--args <args>', 'Comma-separated arguments')
  .option('--url <url>', 'URL for SSE/HTTP servers')
  .option('--env <env...>', 'Environment variable (KEY=VALUE, repeatable)')
  .option('--header <header...>', 'HTTP header (KEY=VALUE, repeatable)')
  .option('--clients <clients>', 'Comma-separated client list')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--description <desc>', 'Server description')
  .option('--no-interactive', 'Skip all prompts')
  .action(async (name, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);

    try {
      let input: CreateServerInput;

      if (name && opts.transport) {
        // Direct mode
        const envVars: Record<string, string> = {};
        if (opts.env) {
          for (const e of opts.env) {
            const [key, ...valueParts] = e.split('=');
            if (key) envVars[key] = valueParts.join('=');
          }
        }

        const headers: Record<string, string> = {};
        if (opts.header) {
          for (const h of opts.header) {
            const [key, ...valueParts] = h.split('=');
            if (key) headers[key] = valueParts.join('=');
          }
        }

        const clients = opts.clients
          ? opts.clients.split(',').map((c: string) => ({ client: c.trim() as ClientType, enabled: true }))
          : [{ client: 'claude-desktop' as ClientType, enabled: true }];

        input = {
          name,
          transport: opts.transport,
          command: opts.command,
          args: opts.args ? opts.args.split(',').map((a: string) => a.trim()) : undefined,
          url: opts.url,
          envVars: Object.keys(envVars).length > 0 ? envVars : undefined,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          description: opts.description,
          tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : undefined,
          source: 'manual',
          enabled: true,
          clients,
        };
      } else {
        // Interactive mode
        const details = await promptServerDetails();
        input = {
          ...details,
          source: 'manual',
          enabled: true,
        };
      }

      const server = inventory.create(input);
      const clientNames = server.clients.filter((c) => c.enabled).map((c) => c.client).join(', ');
      success(`Server "${server.name}" added successfully.`);
      console.log(`  Enabled for: ${clientNames || 'none'}`);
      console.log(`  Run 'mcpman export' to update client configs.`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });
