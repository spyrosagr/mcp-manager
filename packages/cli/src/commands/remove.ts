import { Command } from 'commander';
import { getDatabase, InventoryManager } from '@mcpman/core';
import { success, error } from '../utils/output.js';
import { confirm } from '../utils/interactive.js';

export const removeCommand = new Command('remove')
  .description('Remove an MCP server')
  .argument('<name>', 'Server name')
  .option('--force', 'Skip confirmation')
  .action(async (name, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);

    try {
      const server = inventory.getByName(name);
      if (!server) {
        error(`Server "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      if (!opts.force) {
        const confirmed = await confirm(`Are you sure you want to remove "${name}"?`);
        if (!confirmed) {
          console.log('Cancelled.');
          return;
        }
      }

      inventory.delete(server.id);
      success(`Server "${name}" removed.`);
      console.log(`  Run 'mcpman export' to update client configs.`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });
