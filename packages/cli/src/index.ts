// mcpman CLI — MCP Configuration Manager
import { Command } from 'commander';
import { getDatabase, InventoryManager } from '@mcpman/core';
import { success, error } from './utils/output.js';
import { listCommand } from './commands/list.js';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { editCommand } from './commands/edit.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { doctorCommand } from './commands/doctor.js';
import { configCommand } from './commands/config.js';
import { profileCommand } from './commands/profile.js';
import { healthCommand } from './commands/health.js';
import { auditCommand } from './commands/audit.js';

const program = new Command();

program
  .name('mcpman')
  .description('MCP Configuration Manager & Server Registry')
  .version('0.1.0');

// Register all commands
program.addCommand(listCommand);
program.addCommand(addCommand);
program.addCommand(removeCommand);
program.addCommand(editCommand);
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(doctorCommand);
program.addCommand(configCommand);
program.addCommand(profileCommand);
program.addCommand(healthCommand);
program.addCommand(auditCommand);

// Enable/disable shortcuts
program
  .command('enable <name>')
  .description('Enable a server')
  .action((name) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      const server = inventory.getByName(name);
      if (!server) {
        error(`Server "${name}" not found.`);
        process.exitCode = 1;
        return;
      }
      inventory.update(server.id, { enabled: true });
      success(`Server "${name}" enabled.`);
    } finally {
      db.close();
    }
  });

program
  .command('disable <name>')
  .description('Disable a server')
  .action((name) => {
    const db = getDatabase();
    const inventory = new InventoryManager(db);
    try {
      const server = inventory.getByName(name);
      if (!server) {
        error(`Server "${name}" not found.`);
        process.exitCode = 1;
        return;
      }
      inventory.update(server.id, { enabled: false });
      success(`Server "${name}" disabled.`);
    } finally {
      db.close();
    }
  });

program.parse();
