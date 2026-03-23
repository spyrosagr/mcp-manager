import Table from 'cli-table3';
import type { McpServer, Profile } from '@mcpman/core';

export function formatServerTable(servers: McpServer[]): string {
  const table = new Table({
    head: ['Name', 'Display Name', 'Transport', 'Status', 'Clients'],
    style: { head: ['cyan'] },
  });

  for (const server of servers) {
    const clients = server.clients
      .filter((c) => c.enabled)
      .map((c) => c.client)
      .join(', ');

    table.push([
      server.name,
      server.displayName || '',
      server.transport,
      server.enabled ? 'enabled' : 'disabled',
      clients || 'none',
    ]);
  }

  return table.toString();
}

export function formatProfileTable(profiles: Profile[]): string {
  const table = new Table({
    head: ['Name', 'Description', 'Default'],
    style: { head: ['cyan'] },
  });

  for (const profile of profiles) {
    table.push([
      profile.name,
      profile.description || '',
      profile.isDefault ? '★' : '',
    ]);
  }

  return table.toString();
}
