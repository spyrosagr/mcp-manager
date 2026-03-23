import { Command } from 'commander';
import { McpmanConfig } from '@mcpman/core';
import { success, error } from '../utils/output.js';
import { formatJson } from '../formatters/json.js';

export const configCommand = new Command('config')
  .description('Manage mcpman settings');

configCommand
  .command('list')
  .description('View all settings')
  .action(() => {
    const config = new McpmanConfig();
    console.log(formatJson(config.getAll()));
  });

configCommand
  .command('get <path>')
  .description('Get a specific setting')
  .action((path) => {
    const config = new McpmanConfig();
    const value = config.get(path);
    if (value === undefined) {
      error(`Setting "${path}" not found.`);
      process.exitCode = 1;
    } else {
      console.log(typeof value === 'object' ? formatJson(value) : String(value));
    }
  });

configCommand
  .command('set <path> <value>')
  .description('Set a specific setting')
  .action((path, value) => {
    const config = new McpmanConfig();

    // Try to parse as JSON (for numbers, booleans, arrays)
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }

    config.set(path, parsed);
    success(`Set ${path} = ${JSON.stringify(parsed)}`);
  });
