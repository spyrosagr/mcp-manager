export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private levelValue: number;

  constructor(private level: LogLevel = 'info') {
    this.levelValue = LOG_LEVELS[level];
  }

  setLevel(level: LogLevel): void {
    this.level = level;
    this.levelValue = LOG_LEVELS[level];
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.levelValue <= LOG_LEVELS.debug) {
      this.write('debug', message, context);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.levelValue <= LOG_LEVELS.info) {
      this.write('info', message, context);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.levelValue <= LOG_LEVELS.warn) {
      this.write('warn', message, context);
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.levelValue <= LOG_LEVELS.error) {
      const ctx = error ? { ...context, error: error.message, stack: error.stack } : context;
      this.write('error', message, ctx);
    }
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, level, message, ...context };
    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

// Singleton logger instance
const logLevel = (process.env['MCPMAN_LOG_LEVEL'] as LogLevel) || 'info';
export const logger = new Logger(logLevel);
