import inquirer from 'inquirer';
import { ALL_CLIENTS, type ClientType, type TransportType } from '@mcpman/core';

export async function promptServerDetails(): Promise<{
  name: string;
  displayName?: string;
  transport: TransportType;
  command?: string;
  args?: string[];
  url?: string;
  envVars?: Record<string, string>;
  clients: Array<{ client: ClientType; enabled: boolean }>;
  tags?: string[];
}> {
  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Server name:',
      validate: (v: string) => /^[a-z0-9][a-z0-9._-]*$/i.test(v) || 'Invalid name format',
    },
  ]);

  const { displayName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'displayName',
      message: 'Display name (optional):',
    },
  ]);

  const { transport } = await inquirer.prompt([
    {
      type: 'list',
      name: 'transport',
      message: 'Transport type:',
      choices: [
        { name: 'stdio (local process)', value: 'stdio' },
        { name: 'sse (Server-Sent Events)', value: 'sse' },
        { name: 'streamable-http (HTTP streaming)', value: 'streamable-http' },
      ],
    },
  ]);

  let command: string | undefined;
  let args: string[] | undefined;
  let url: string | undefined;

  if (transport === 'stdio') {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'command', message: 'Command:', validate: (v: string) => v.length > 0 || 'Required' },
      { type: 'input', name: 'args', message: 'Arguments (comma-separated):' },
    ]);
    command = answers.command;
    args = answers.args ? answers.args.split(',').map((a: string) => a.trim()) : [];
  } else {
    const answers = await inquirer.prompt([
      { type: 'input', name: 'url', message: 'URL:', validate: (v: string) => v.startsWith('http') || 'Must be a URL' },
    ]);
    url = answers.url;
  }

  const { envInput } = await inquirer.prompt([
    {
      type: 'input',
      name: 'envInput',
      message: 'Environment variables (KEY=VALUE, comma-separated):',
    },
  ]);

  let envVars: Record<string, string> | undefined;
  if (envInput) {
    envVars = {};
    for (const pair of envInput.split(',')) {
      const [key, ...valueParts] = pair.trim().split('=');
      if (key) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  }

  const { selectedClients } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedClients',
      message: 'Which clients should receive this server?',
      choices: ALL_CLIENTS.map((c) => ({ name: c, value: c, checked: ['claude-desktop', 'cursor', 'vscode'].includes(c) })),
    },
  ]);

  const { tagsInput } = await inquirer.prompt([
    { type: 'input', name: 'tagsInput', message: 'Tags (comma-separated, optional):' },
  ]);

  return {
    name,
    displayName: displayName || undefined,
    transport,
    command,
    args,
    url,
    envVars,
    clients: (selectedClients as ClientType[]).map((c) => ({ client: c, enabled: true })),
    tags: tagsInput ? tagsInput.split(',').map((t: string) => t.trim()) : undefined,
  };
}

export async function confirm(message: string, defaultValue = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    { type: 'confirm', name: 'confirmed', message, default: defaultValue },
  ]);
  return confirmed;
}
