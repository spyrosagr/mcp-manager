import { Command } from 'commander';
import Table from 'cli-table3';
import {
  getDatabase,
  InventoryManager,
  RegistryClient,
} from '@mcpman/core';
import type { RegistryServer } from '@mcpman/core';
import { success, error, spinner, bold } from '../utils/output.js';
import { formatJson } from '../formatters/json.js';

export const registryCommand = new Command('registry')
  .description('Browse and install from the MCP Registry');

registryCommand
  .command('search <query>')
  .description('Search the MCP Registry')
  .option('--limit <n>', 'Max results', '20')
  .option('--json', 'Output raw JSON')
  .action(async (query: string, opts: { limit: string; json?: boolean }) => {
    const client = new RegistryClient();
    try {
      const spin = spinner(`Searching registry for "${query}"...`);
      spin.start();
      const result = await client.search(query, { limit: parseInt(opts.limit, 10) });
      spin.stop();

      if (opts.json) {
        console.log(formatJson(result));
        return;
      }

      if (result.servers.length === 0) {
        console.log('No servers found.');
        return;
      }

      const table = new Table({
        head: ['Name', 'Description', 'Version'],
        style: { head: ['cyan'] },
        colWidths: [35, 45, 10],
      });

      for (const server of result.servers) {
        table.push([
          server.name,
          truncate(server.description, 42),
          server.version || '—',
        ]);
      }

      console.log(table.toString());
      if (result.totalCount) {
        console.log(`\n${result.totalCount} result(s)`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      client.close();
    }
  });

registryCommand
  .command('info <name>')
  .description('Show details for a registry server')
  .option('--json', 'Output raw JSON')
  .action(async (name: string, opts: { json?: boolean }) => {
    const client = new RegistryClient();
    try {
      const spin = spinner(`Fetching ${name}...`);
      spin.start();
      const server = await client.getServer(name);
      spin.stop();

      if (!server) {
        error(`Server "${name}" not found in registry.`);
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(formatJson(server));
        return;
      }

      printServerInfo(server);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      client.close();
    }
  });

registryCommand
  .command('install <name>')
  .description('Install a server from the registry')
  .option('--clients <clients>', 'Comma-separated client list', 'claude-desktop')
  .option('--json', 'Output raw JSON')
  .action(async (name: string, opts: { clients: string; json?: boolean }) => {
    const registryClient = new RegistryClient();
    const db = getDatabase();
    const inventory = new InventoryManager(db);

    try {
      const spin = spinner(`Fetching ${name} from registry...`);
      spin.start();
      const server = await registryClient.getServer(name);
      spin.stop();

      if (!server) {
        error(`Server "${name}" not found in registry.`);
        process.exitCode = 1;
        return;
      }

      // Determine transport and command
      const clientList = opts.clients.split(',').map((c) => c.trim());
      const shortName = server.name.split('/').pop() || server.name;

      // Check if already exists
      if (inventory.getByName(shortName)) {
        error(`Server "${shortName}" already exists in inventory. Use a different name.`);
        process.exitCode = 1;
        return;
      }

      let transport: 'stdio' | 'sse' | 'streamable-http' = 'stdio';
      let command: string | undefined;
      let args: string[] | undefined;
      let url: string | undefined;

      // Prefer npm package for stdio
      const npmPkg = server.packages?.find((p) => p.registry === 'npm');
      const pypiPkg = server.packages?.find((p) => p.registry === 'pypi');
      const remote = server.remotes?.[0];

      if (npmPkg) {
        command = 'npx';
        args = ['-y', npmPkg.name];
      } else if (pypiPkg) {
        command = 'uvx';
        args = [pypiPkg.name];
      } else if (remote) {
        transport = remote.transportType as 'sse' | 'streamable-http';
        url = remote.url;
      } else {
        error('Cannot determine how to install this server (no packages or remotes).');
        process.exitCode = 1;
        return;
      }

      const created = inventory.create({
        name: shortName,
        displayName: server.description,
        transport,
        command,
        args,
        url,
        source: 'registry',
        registryId: server.name,
        enabled: true,
        clients: clientList.map((c) => ({
          client: c as import('@mcpman/core').ClientType,
          enabled: true,
        })),
      });

      if (opts.json) {
        console.log(formatJson(created));
        return;
      }

      success(`Server "${shortName}" installed from registry.`);
      console.log(`  Transport: ${transport}`);
      if (command) console.log(`  Command: ${command} ${(args || []).join(' ')}`);
      if (url) console.log(`  URL: ${url}`);
      console.log(`  Clients: ${clientList.join(', ')}`);
      console.log(`\nRun 'mcpman export' to update client configs.`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      registryClient.close();
      db.close();
    }
  });

registryCommand
  .command('refresh')
  .description('Refresh the local registry cache')
  .option('--json', 'Output raw JSON')
  .action(async (opts: { json?: boolean }) => {
    const client = new RegistryClient();
    try {
      const spin = spinner('Refreshing registry cache...');
      spin.start();
      const result = await client.refreshCache();
      spin.stop();

      if (opts.json) {
        console.log(formatJson(result));
        return;
      }

      success(`Cached ${result.totalCached} servers (${result.newSinceLastRefresh} new since last refresh)`);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    } finally {
      client.close();
    }
  });

function printServerInfo(server: RegistryServer): void {
  console.log(bold(`Name: ${server.name}`));
  console.log(`Description: ${server.description}`);
  console.log(`Version: ${server.version}`);
  if (server.repository) {
    console.log(`Repository: ${server.repository.url}`);
  }

  if (server.packages && server.packages.length > 0) {
    console.log('Packages:');
    for (const pkg of server.packages) {
      console.log(`  ${pkg.registry}: ${pkg.name}${pkg.version ? `@${pkg.version}` : ''}`);
    }
  }

  if (server.remotes && server.remotes.length > 0) {
    console.log('Remote endpoints:');
    for (const remote of server.remotes) {
      console.log(`  ${remote.transportType}: ${remote.url}`);
    }
  }

  if (server.meta?.publishedAt) {
    console.log(`Published: ${server.meta.publishedAt.split('T')[0]}`);
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
