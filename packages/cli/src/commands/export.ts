import { Command } from 'commander';
import {
  getDatabase,
  InventoryManager,
  ConfigExporter,
  ALL_CLIENTS,
  type ClientType,
  type ExportOptions,
} from '@mcpman/core';
import { success, error, warn } from '../utils/output.js';

export const exportCommand = new Command('export')
  .description('Export config to client(s)')
  .argument('[client]', 'Client name (e.g. claude-desktop, cursor, vscode)')
  .option('--all', 'Export to all configured clients')
  .option('--dry-run', 'Preview changes without writing')
  .option('--no-backup', 'Skip backup of existing config')
  .option('--no-merge', 'Replace entire file instead of merging')
  .option('--profile <name>', 'Export only servers in this profile')
  .option('--force', 'Overwrite even if no changes detected')
  .action((client, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    const exporter = new ConfigExporter(inventory);

    try {
      const exportOpts: ExportOptions = {
        backup: opts.backup !== false,
        merge: opts.merge !== false,
        dryRun: opts.dryRun,
      };

      if (opts.profile) {
        const profile = inventory.getProfileByName(opts.profile);
        if (!profile) {
          error(`Profile "${opts.profile}" not found.`);
          process.exitCode = 1;
          return;
        }
        exportOpts.profileId = profile.id;
      }

      if (opts.all) {
        const results = exporter.exportAll(exportOpts);

        if (opts.dryRun) {
          for (const [c] of results) {
            const preview = exporter.preview(c, exportOpts);
            console.log(`\n--- ${c} ---`);
            console.log(preview.diff);
          }
          return;
        }

        const writeResults = exporter.writeAll(results, exportOpts);
        let count = 0;
        for (const [c, result] of writeResults) {
          const exportResult = results.get(c);
          if (result.written) {
            success(`${c}: ${exportResult?.serverCount ?? 0} servers → ${result.filePath}`);
            count++;
          } else if (result.error) {
            warn(`${c}: ${result.error}`);
          }
        }
        console.log(`  ${count} configs updated.`);
      } else if (client) {
        if (!ALL_CLIENTS.includes(client as ClientType)) {
          error(`Unknown client: ${client}. Valid clients: ${ALL_CLIENTS.join(', ')}`);
          process.exitCode = 1;
          return;
        }

        const result = exporter.export(client as ClientType, exportOpts);

        if (opts.dryRun) {
          const preview = exporter.preview(client as ClientType, exportOpts);
          console.log(preview.diff);
          return;
        }

        const writeResult = exporter.write(client as ClientType, result, exportOpts);
        if (writeResult.written) {
          success(`Exported ${result.serverCount} servers to ${writeResult.filePath}`);
          if (writeResult.backupPath) {
            console.log(`  Backup saved to ${writeResult.backupPath}`);
          }
        } else {
          error(`Failed to write: ${writeResult.error}`);
          process.exitCode = 1;
        }
      } else {
        error('Specify a client name or use --all. Valid clients: ' + ALL_CLIENTS.join(', '));
        process.exitCode = 1;
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });
