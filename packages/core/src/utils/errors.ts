import type { ZodIssue } from 'zod';

export class McpmanError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'McpmanError';
  }
}

export class ServerNotFoundError extends McpmanError {
  constructor(identifier: string) {
    super(`Server not found: ${identifier}`, 'SERVER_NOT_FOUND');
  }
}

export class DuplicateServerError extends McpmanError {
  constructor(name: string) {
    super(`Server with name "${name}" already exists`, 'DUPLICATE_SERVER');
  }
}

export class ConfigFileError extends McpmanError {
  constructor(path: string, reason: string) {
    super(`Config file error at ${path}: ${reason}`, 'CONFIG_FILE_ERROR');
  }
}

export class HealthCheckError extends McpmanError {
  constructor(serverName: string, reason: string) {
    super(`Health check failed for "${serverName}": ${reason}`, 'HEALTH_CHECK_ERROR');
  }
}

export class RegistryError extends McpmanError {
  constructor(message: string) {
    super(message, 'REGISTRY_ERROR');
  }
}

export class ValidationError extends McpmanError {
  constructor(message: string, public issues: ZodIssue[]) {
    super(message, 'VALIDATION_ERROR');
  }
}
