/**
 * Logger Module
 * AES-SPEC-001: Configurable logging with levels
 *
 * Provides structured logging with configurable verbosity.
 */

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

export interface LoggerConfig {
  level: LogLevel;
  timestamps: boolean;
  colors: boolean;
  module?: string;
}

// =============================================================================
// Constants
// =============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  timestamps: true,
  colors: true,
};

// Global configuration
let globalConfig: LoggerConfig = { ...DEFAULT_CONFIG };

// =============================================================================
// Logger Class
// =============================================================================

export class Logger {
  private config: LoggerConfig;
  private module: string;

  constructor(module: string, config: Partial<LoggerConfig> = {}) {
    this.module = module;
    this.config = { ...globalConfig, ...config, module };
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private formatTimestamp(): string {
    if (!this.config.timestamps) return '';
    const now = new Date().toISOString();
    if (this.config.colors) {
      return `${COLORS.dim}[${now}]${COLORS.reset} `;
    }
    return `[${now}] `;
  }

  private formatLevel(level: LogLevel): string {
    const labels: Record<LogLevel, string> = {
      debug: 'DBG',
      info: 'INF',
      warn: 'WRN',
      error: 'ERR',
      silent: '',
    };

    if (!this.config.colors) {
      return `[${labels[level]}]`;
    }

    const colors: Record<LogLevel, string> = {
      debug: COLORS.gray,
      info: COLORS.blue,
      warn: COLORS.yellow,
      error: COLORS.red,
      silent: '',
    };

    return `${colors[level]}[${labels[level]}]${COLORS.reset}`;
  }

  private formatModule(): string {
    if (this.config.colors) {
      return `${COLORS.cyan}[${this.module}]${COLORS.reset}`;
    }
    return `[${this.module}]`;
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const parts = [
      this.formatTimestamp(),
      this.formatLevel(level),
      this.formatModule(),
      message,
    ].filter(Boolean);

    let output = parts.join(' ');

    if (data !== undefined) {
      if (typeof data === 'object') {
        output += '\n' + JSON.stringify(data, null, 2);
      } else {
        output += ` ${data}`;
      }
    }

    return output;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data));
    }
  }

  /**
   * Create a child logger with a sub-module name
   */
  child(subModule: string): Logger {
    return new Logger(`${this.module}:${subModule}`, this.config);
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Set log level for this logger instance
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

// =============================================================================
// Global Functions
// =============================================================================

/**
 * Configure global logger settings
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current global configuration
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...globalConfig };
}

/**
 * Set global log level
 */
export function setLogLevel(level: LogLevel): void {
  globalConfig.level = level;
}

/**
 * Get global log level
 */
export function getLogLevel(): LogLevel {
  return globalConfig.level;
}

/**
 * Create a new logger for a module
 */
export function createLogger(module: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger(module, config);
}

/**
 * Parse log level from string (for CLI)
 */
export function parseLogLevel(value: string): LogLevel | null {
  const normalized = value.toLowerCase();
  if (normalized in LOG_LEVELS) {
    return normalized as LogLevel;
  }
  return null;
}

/**
 * List available log levels
 */
export function getAvailableLevels(): LogLevel[] {
  return ['debug', 'info', 'warn', 'error', 'silent'];
}

// =============================================================================
// Pre-configured Loggers
// =============================================================================

export const loggers = {
  core: createLogger('core'),
  events: createLogger('events'),
  verify: createLogger('verify'),
  recovery: createLogger('recovery'),
  daemon: createLogger('daemon'),
  operations: createLogger('operations'),
  continuity: createLogger('continuity'),
  learning: createLogger('learning'),
  analytics: createLogger('analytics'),
};

// =============================================================================
// Default Export
// =============================================================================

export default Logger;
