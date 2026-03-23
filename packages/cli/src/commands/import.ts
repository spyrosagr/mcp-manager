import { Command } from 'commander';
import {
  getDatabase,
  InventoryManager,
  importFromClient,
  importFromFile,
  ALL_CLIENTS,
  type ClientType,
} from '@mcpman/core';
import { success, error, warn, info } from '../utils/output.js';

export const importCommand = new Command('import')
  .description("Import servers from a client's config")
  .argument('[client]', 'Client name')
  .option('--all', 'Import from all detectable client configs')
  .option('--file <path>', 'Import from a specific file')
  .option('--dry-run', 'Show what would be imported without doing it')
  .action((client, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);

    try {
      if (opts.all) {
        info('Scanning all client configs...');
        let totalImported = 0;

        for (const c of ALL_CLIENTS) {
          try {
            const result = importFromClient(c, inventory);
            if (result.imported > 0 || result.skipped > 0) {
              console.log(`  ${c}: found ${result.imported + result.skipped + result.errors.length} servers`);
              if (result.imported > 0) {
                success(`  Imported ${result.imported} new servers from ${c}`);
              }
              if (result.skipped > 0) {
                console.log(`    ${result.skipped} duplicates skipped`);
              }
              totalImported += result.imported;
            }
          } catch {
            // Config file not found — skip silently
          }
        }

        console.log(`\nImported ${totalImported} unique servers total.`);
      } else if (client) {
        if (!ALL_CLIENTS.includes(client as ClientType)) {
          error(`Unknown client: ${client}. Valid clients: ${ALL_CLIENTS.join(', ')}`);
          process.exitCode = 1;
          return;
        }

        const result = opts.file
          ? importFromFile(opts.file, client as ClientType, inventory)
          : importFromClient(client as ClientType, inventory);

        console.log(`Found ${result.imported + result.skipped + result.errors.length} servers in ${client} config:`);
        for (const server of result.servers) {
          success(`  ${server.name} (new — added)`);
        }
        if (result.skipped > 0) {
          warn(`  ${result.skipped} already exist — skipped`);
        }
        for (const err of result.errors) {
          error(`  ${err.name} (error: ${err.error})`);
        }

        console.log(`\nImported ${result.imported} servers, skipped ${result.skipped}, errors ${result.errors.length}.`);
      } else {
        error('Specify a client name or use --all.');
        process.exitCode = 1;
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });
