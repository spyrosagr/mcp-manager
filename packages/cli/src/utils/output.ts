import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export function success(message: string): void {
  console.log(chalk.green('✓') + ' ' + message);
}

export function error(message: string): void {
  console.error(chalk.red('✗') + ' ' + message);
}

export function warn(message: string): void {
  console.log(chalk.yellow('⚠') + ' ' + message);
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

export function spinner(text: string): Ora {
  return ora({ text, color: 'cyan' });
}

export function dim(text: string): string {
  return chalk.dim(text);
}

export function bold(text: string): string {
  return chalk.bold(text);
}
