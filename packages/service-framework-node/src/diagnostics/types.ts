export type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogOutputFormat = 'json' | 'human' | 'structured-text';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(
    error: unknown,
    message?: string | Record<string, unknown>,
    fields?: Record<string, unknown>,
  ): void;
  fatal(
    error: unknown,
    message?: string | Record<string, unknown>,
    fields?: Record<string, unknown>,
  ): void;
  createChild(correlationId: string): Logger;
}

export interface CorrelationIdGenerator {
  generateRootId(): string;
  createScopedId(parentId: string, scope: string): string;
  extractRootId(scopedId: string): string;
}

export interface LogEntry {
  timestamp: string;
  severity: LogSeverity;
  message: string;
  serviceName: string;
  correlationId?: string;
  fields?: Record<string, unknown>;
}

export interface DiagnosticConfig {
  minimumSeverity?: LogSeverity;
  outputFormat?: LogOutputFormat;
  correlationId?: string;
  defaultLoggerArgs?: Record<string, unknown>;
}

export interface DiagnosticContext {
  correlationIdGenerator: CorrelationIdGenerator;
  logger: Logger;
  createChildLogger: (correlationId: string) => Logger;
  getChildDiagnosticContext: (
    defaultLoggerArgs?: Record<string, unknown>,
    scopeId?: string,
  ) => DiagnosticContext;
}
