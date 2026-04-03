import { Command } from 'commander';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  getDatabase,
  InventoryManager,
  ALL_CLIENTS,
  getClientConfigPath,
  getMcpmanDbPath,
} from '@mcpman/core';
import { success, error, warn, bold } from '../utils/output.js';

export const doctorCommand = new Command('doctor')
  .description('Diagnose common issues')
  .action(() => {
    console.log(bold('mcpman Doctor'));
    console.log('═'.repeat(40));
    console.log();

    // Database check
    const dbPath = getMcpmanDbPath();
    try {
      const db = getDatabase();
      const inventory = new InventoryManager(db);
      const servers = inventory.list();
      const profiles = inventory.listProfiles();
      success(`Database: ${dbPath} (${servers.length} servers, ${profiles.length} profiles)`);
      db.close();
    } catch {
      error(`Database: ${dbPath} (not accessible)`);
    }

    // Node.js version
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1), 10);
    if (major >= 20) {
      success(`Node.js: ${nodeVersion} (>= 20 required)`);
    } else {
      error(`Node.js: ${nodeVersion} (>= 20 required)`);
    }

    // Tool availability
    for (const tool of ['npx', 'uvx', 'docker']) {
      try {
        const toolPath = execSync(`which ${tool} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        success(`${tool}: available at ${toolPath}`);
      } catch {
        warn(`${tool}: not found`);
      }
    }

    // Client configs
    console.log('\nClient Configs:');
    for (const client of ALL_CLIENTS) {
      const configPath = getClientConfigPath(client);
      try {
        fs.accessSync(configPath);
        success(`  ${client}: config found at ${configPath}`);
      } catch {
        warn(`  ${client}: no config found at ${configPath}`);
      }
    }
  });
