import { Command } from 'commander';
import { getDatabase, InventoryManager } from '@mcpman/core';
import { success, error } from '../utils/output.js';
import { formatProfileTable, formatServerTable } from '../formatters/table.js';
import { confirm } from '../utils/interactive.js';

export const profileCommand = new Command('profile')
  .description('Manage server profiles');

profileCommand
  .command('create <name>')
  .description('Create a new profile')
  .option('--description <desc>', 'Profile description')
  .action((name, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      inventory.createProfile(name, opts.description);
      success(`Profile "${name}" created.`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });

profileCommand
  .command('delete <name>')
  .description('Delete a profile')
  .option('--force', 'Skip confirmation')
  .action(async (name, opts) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      const profile = inventory.getProfileByName(name);
      if (!profile) {
        error(`Profile "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      if (!opts.force) {
        const confirmed = await confirm(`Delete profile "${name}"?`);
        if (!confirmed) return;
      }

      inventory.deleteProfile(profile.id);
      success(`Profile "${name}" deleted.`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });

profileCommand
  .command('list')
  .description('List all profiles')
  .action(() => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      const profiles = inventory.listProfiles();
      if (profiles.length === 0) {
        console.log('No profiles found. Create one with: mcpman profile create <name>');
      } else {
        console.log(formatProfileTable(profiles));
      }
    } finally {
      db.close();
    }
  });

profileCommand
  .command('show <name>')
  .description('Show servers in a profile')
  .action((name) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      const profile = inventory.getProfileByName(name);
      if (!profile) {
        error(`Profile "${name}" not found.`);
        process.exitCode = 1;
        return;
      }
      const servers = inventory.getServersInProfile(profile.id);
      if (servers.length === 0) {
        console.log(`Profile "${name}" has no servers.`);
      } else {
        console.log(formatServerTable(servers));
      }
    } finally {
      db.close();
    }
  });

profileCommand
  .command('add-server <profile> <servers...>')
  .description('Add servers to a profile')
  .action((profileName, serverNames) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      const profile = inventory.getProfileByName(profileName);
      if (!profile) {
        error(`Profile "${profileName}" not found.`);
        process.exitCode = 1;
        return;
      }

      const added: string[] = [];
      for (const serverName of serverNames) {
        const server = inventory.getByName(serverName);
        if (!server) {
          error(`Server "${serverName}" not found.`);
          continue;
        }
        inventory.addToProfile(profile.id, server.id);
        added.push(serverName);
      }

      if (added.length > 0) {
        success(`Added ${added.join(', ')} to profile "${profileName}".`);
      }
    } finally {
      db.close();
    }
  });

profileCommand
  .command('remove-server <profile> <servers...>')
  .description('Remove servers from a profile')
  .action((profileName, serverNames) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      const profile = inventory.getProfileByName(profileName);
      if (!profile) {
        error(`Profile "${profileName}" not found.`);
        process.exitCode = 1;
        return;
      }

      for (const serverName of serverNames) {
        const server = inventory.getByName(serverName);
        if (!server) {
          error(`Server "${serverName}" not found.`);
          continue;
        }
        inventory.removeFromProfile(profile.id, server.id);
      }

      success(`Removed servers from profile "${profileName}".`);
    } finally {
      db.close();
    }
  });

profileCommand
  .command('set-default <name>')
  .description('Set the default profile')
  .action((name) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      const profile = inventory.getProfileByName(name);
      if (!profile) {
        error(`Profile "${name}" not found.`);
        process.exitCode = 1;
        return;
      }
      inventory.setDefaultProfile(profile.id);
      success(`Profile "${name}" set as default.`);
    } finally {
      db.close();
    }
  });
