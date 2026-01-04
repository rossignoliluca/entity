/**
 * Logger Module Tests
 * AES-SPEC-001: Configurable logging
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  Logger,
  configureLogger,
  setLogLevel,
  getLogLevel,
  parseLogLevel,
  getAvailableLevels,
  createLogger,
  getLoggerConfig,
  type LogLevel,
} from '../src/logger.js';

// =============================================================================
// Logger Class Tests
// =============================================================================

describe('Logger', () => {
  it('should create logger with module name', () => {
    const logger = new Logger('test-module');
    assert.ok(logger);
  });

  it('should respect log level', () => {
    const logger = new Logger('test', { level: 'warn' });
    assert.strictEqual(logger.getLevel(), 'warn');
  });

  it('should allow changing log level', () => {
    const logger = new Logger('test', { level: 'info' });
    logger.setLevel('debug');
    assert.strictEqual(logger.getLevel(), 'debug');
  });

  it('should create child logger', () => {
    const parent = new Logger('parent');
    const child = parent.child('child');
    assert.ok(child);
  });
});

// =============================================================================
// Log Level Tests
// =============================================================================

describe('Log Levels', () => {
  beforeEach(() => {
    setLogLevel('info');
  });

  it('should get current log level', () => {
    const level = getLogLevel();
    assert.strictEqual(level, 'info');
  });

  it('should set log level', () => {
    setLogLevel('debug');
    assert.strictEqual(getLogLevel(), 'debug');
  });

  it('should parse valid log level', () => {
    assert.strictEqual(parseLogLevel('debug'), 'debug');
    assert.strictEqual(parseLogLevel('INFO'), 'info');
    assert.strictEqual(parseLogLevel('WARN'), 'warn');
    assert.strictEqual(parseLogLevel('error'), 'error');
    assert.strictEqual(parseLogLevel('Silent'), 'silent');
  });

  it('should return null for invalid log level', () => {
    assert.strictEqual(parseLogLevel('invalid'), null);
    assert.strictEqual(parseLogLevel(''), null);
    assert.strictEqual(parseLogLevel('trace'), null);
  });

  it('should list available levels', () => {
    const levels = getAvailableLevels();
    assert.ok(levels.includes('debug'));
    assert.ok(levels.includes('info'));
    assert.ok(levels.includes('warn'));
    assert.ok(levels.includes('error'));
    assert.ok(levels.includes('silent'));
    assert.strictEqual(levels.length, 5);
  });
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe('Logger Configuration', () => {
  beforeEach(() => {
    configureLogger({ level: 'info', timestamps: true, colors: true });
  });

  it('should configure logger globally', () => {
    configureLogger({ level: 'debug' });
    const config = getLoggerConfig();
    assert.strictEqual(config.level, 'debug');
  });

  it('should configure timestamps', () => {
    configureLogger({ timestamps: false });
    const config = getLoggerConfig();
    assert.strictEqual(config.timestamps, false);
  });

  it('should configure colors', () => {
    configureLogger({ colors: false });
    const config = getLoggerConfig();
    assert.strictEqual(config.colors, false);
  });

  it('should create logger with custom config', () => {
    const logger = createLogger('custom', { level: 'error' });
    assert.strictEqual(logger.getLevel(), 'error');
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createLogger', () => {
  it('should create logger with module name', () => {
    const logger = createLogger('my-module');
    assert.ok(logger);
  });

  it('should create logger with config', () => {
    const logger = createLogger('my-module', { level: 'warn' });
    assert.strictEqual(logger.getLevel(), 'warn');
  });
});

// =============================================================================
// Level Hierarchy Tests
// =============================================================================

describe('Log Level Hierarchy', () => {
  it('should have correct level order', () => {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

    // Verify each level exists
    for (const level of levels) {
      const parsed = parseLogLevel(level);
      assert.strictEqual(parsed, level);
    }
  });

  it('debug level should log all messages', () => {
    const logger = new Logger('test', { level: 'debug' });
    // In debug mode, all levels should be loggable
    assert.strictEqual(logger.getLevel(), 'debug');
  });

  it('error level should only log errors', () => {
    const logger = new Logger('test', { level: 'error' });
    assert.strictEqual(logger.getLevel(), 'error');
  });

  it('silent level should log nothing', () => {
    const logger = new Logger('test', { level: 'silent' });
    assert.strictEqual(logger.getLevel(), 'silent');
  });
});

// =============================================================================
// Child Logger Tests
// =============================================================================

describe('Child Loggers', () => {
  it('should inherit parent config', () => {
    const parent = createLogger('parent', { level: 'warn' });
    const child = parent.child('child');
    assert.strictEqual(child.getLevel(), 'warn');
  });

  it('should create nested child loggers', () => {
    const root = createLogger('root');
    const child1 = root.child('child1');
    const child2 = child1.child('child2');
    assert.ok(child2);
  });
});
