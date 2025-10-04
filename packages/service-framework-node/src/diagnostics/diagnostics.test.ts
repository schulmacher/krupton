import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DefaultEnvContext } from '../environment/types.js';
import {
  createLogger,
  createCorrelationIdGenerator,
  createDiagnosticContext,
} from './diagnostics.js';

const createTestEnvContext = (): DefaultEnvContext => ({
  config: { PROCESS_NAME: 'test-service' },
  nodeEnv: 'test',
});
import type { LogEntry } from './types.js';

describe('createCorrelationIdGenerator', () => {
  const generator = createCorrelationIdGenerator();

  it('generates root IDs with req- prefix', () => {
    const rootId = generator.generateRootId();
    expect(rootId).toMatch(/^req-[0-9a-f-]+$/);
  });

  it('creates scoped IDs by appending scope to parent', () => {
    const parentId = 'req-abc123';
    const scope = 'operation';
    const scopedId = generator.createScopedId(parentId, scope);
    expect(scopedId).toBe('req-abc123.operation');
  });

  it('creates nested scoped IDs', () => {
    const rootId = generator.generateRootId();
    const firstScope = generator.createScopedId(rootId, 'operation');
    const secondScope = generator.createScopedId(firstScope, 'subrequest');
    expect(secondScope).toMatch(/^req-.+\.operation\.subrequest$/);
  });

  it('extracts root ID from scoped ID', () => {
    const rootId = 'req-xyz789';
    const scopedId = 'req-xyz789.operation.subrequest.cache';
    const extracted = generator.extractRootId(scopedId);
    expect(extracted).toBe(rootId);
  });

  it('returns original ID when no scope delimiter exists', () => {
    const simpleId = 'req-simple';
    const extracted = generator.extractRootId(simpleId);
    expect(extracted).toBe(simpleId);
  });
});

describe('createLogger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('logs info messages with JSON format', () => {
    const logger = createLogger('test-service', 'test-id', { outputFormat: 'json' });
    logger.info('Test message', { key: 'value' });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;

    expect(parsed.severity).toBe('info');
    expect(parsed.message).toBe('Test message');
    expect(parsed.correlationId).toBe('test-id');
    expect(parsed.fields).toEqual({ key: 'value' });
  });

  it('logs error messages to console.error', () => {
    const logger = createLogger('test-service', 'test-id', { outputFormat: 'json' });
    logger.error('Error occurred', { code: 500 });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleErrorSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;

    expect(parsed.severity).toBe('error');
    expect(parsed.message).toBe('Error occurred');
  });

  it('logs fatal messages to console.error', () => {
    const logger = createLogger('test-service', 'test-id', { outputFormat: 'json' });
    logger.fatal('Fatal error', { terminating: true });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleErrorSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;

    expect(parsed.severity).toBe('fatal');
  });

  it('respects minimum severity level', () => {
    const logger = createLogger('test-service', 'test-id', {
      minimumSeverity: 'warn',
      outputFormat: 'json',
    });

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warning message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;
    expect(parsed.severity).toBe('warn');
  });

  it('creates child logger with scoped correlation ID', () => {
    const parentLogger = createLogger('test-service', 'parent-id', {
      outputFormat: 'json',
    });
    const childLogger = parentLogger.createChild('child-scope');

    childLogger.info('Child message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;
    expect(parsed.correlationId).toBe('parent-id.child-scope');
  });

  it('formats logs as human readable text', () => {
    const logger = createLogger('test-service', 'test-id', { outputFormat: 'human' });
    logger.info('Human readable message', { key: 'value' });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];

    expect(logOutput).toContain('INFO');
    expect(logOutput).toContain('[test-id]');
    expect(logOutput).toContain('Human readable message');
    expect(logOutput).toContain('"key":"value"');
  });

  it('formats logs as structured text', () => {
    const logger = createLogger('test-service', 'test-id', {
      outputFormat: 'structured-text',
    });
    logger.info('Structured message', { key: 'value', count: 42 });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];

    expect(logOutput).toContain('severity=info');
    expect(logOutput).toContain('message="Structured message"');
    expect(logOutput).toContain('correlation_id=test-id');
    expect(logOutput).toContain('key="value"');
    expect(logOutput).toContain('count=42');
  });

  it('handles logging without correlation ID', () => {
    const logger = createLogger('test-service', undefined, { outputFormat: 'json' });
    logger.info('Message without correlation');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;
    expect(parsed.correlationId).toBeUndefined();
  });

  it('handles logging without fields', () => {
    const logger = createLogger('test-service', 'test-id', { outputFormat: 'json' });
    logger.info('Simple message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;
    expect(parsed.fields).toBeUndefined();
  });
});

describe('createDiagnosticContext', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('creates diagnostic context with correlation ID generator', () => {
    const context = createDiagnosticContext(createTestEnvContext());
    expect(context.correlationIdGenerator).toBeDefined();
    expect(context.createRootLogger).toBeDefined();
    expect(context.createChildLogger).toBeDefined();
  });

  it('creates root logger with generated correlation ID', () => {
    const context = createDiagnosticContext(createTestEnvContext(), { outputFormat: 'json' });
    const logger = context.createRootLogger();

    logger.info('Test message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;
    expect(parsed.correlationId).toMatch(/^req-[0-9a-f-]+$/);
  });

  it('creates logger with specific correlation ID', () => {
    const context = createDiagnosticContext(createTestEnvContext(), { outputFormat: 'json' });
    const logger = context.createChildLogger('custom-id');

    logger.info('Test message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const parsed = JSON.parse(logOutput as string) as LogEntry;
    expect(parsed.correlationId).toBe('custom-id');
  });
});
