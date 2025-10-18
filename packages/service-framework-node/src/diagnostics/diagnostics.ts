import { randomUUID } from 'node:crypto';
import type { DefaultEnvContext } from '../environment/types.js';
import type {
  CorrelationIdGenerator,
  DiagnosticConfig,
  DiagnosticContext,
  LogEntry,
  Logger,
  LogOutputFormat,
  LogSeverity,
} from './types.js';

const severityLevels: Record<LogSeverity, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const resetColor = '\x1b[0m';
const msgColor = '\x1b[34m';
const debugColor = '\x1b[36m';
const infoColor = '\x1b[32m';

const severityColors: Record<LogSeverity, string> = {
  debug: debugColor,
  info: infoColor,
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[35m',
};

const scopeDelimiter = '.';

export function createCorrelationIdGenerator(): CorrelationIdGenerator {
  return {
    generateRootId(): string {
      return `req-${randomUUID()}`;
    },

    createScopedId(parentId: string, scope: string): string {
      return `${parentId}${scopeDelimiter}${scope}`;
    },

    extractRootId(scopedId: string): string {
      const firstDelimiterIndex = scopedId.indexOf(scopeDelimiter);
      if (firstDelimiterIndex === -1) {
        return scopedId;
      }
      return scopedId.substring(0, firstDelimiterIndex);
    },
  };
}

function formatAsJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function formatAsHumanReadable(entry: LogEntry): string {
  const severityColor = severityColors[entry.severity];

  const parts: string[] = [
    `${severityColor}${entry.severity}${resetColor}`,
    `process=${msgColor}${entry.serviceName}${resetColor}`,
    `ts=${msgColor}${entry.timestamp}${resetColor}`,
    `msg="${severityColor}${entry.message}${resetColor}"`,
  ];

  if (entry.fields) {
    for (const [key, value] of Object.entries(entry.fields)) {
      const serializedValue = typeof value === 'object' ? JSON.stringify(value) : `"${value}"`;
      parts.push(`${key}=${severityColor}${serializedValue}${resetColor}`);
    }
  }

  // if (entry.correlationId) {
  //   parts.push(`corr_id=${entry.correlationId}`);
  // }

  return parts.join(' ');
}

function formatAsStructuredText(entry: LogEntry): string {
  const parts: string[] = [
    `timestamp=${entry.timestamp}`,
    `service_name=${entry.serviceName}`,
    `severity=${entry.severity}`,
    `message="${entry.message}"`,
  ];

  if (entry.correlationId) {
    parts.push(`correlation_id=${entry.correlationId}`);
  }

  if (entry.fields) {
    for (const [key, value] of Object.entries(entry.fields)) {
      const serializedValue = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
      parts.push(`${key}=${serializedValue}`);
    }
  }

  return parts.join(' ');
}

function formatLogEntry(entry: LogEntry, outputFormat: LogOutputFormat): string {
  switch (outputFormat) {
    case 'json':
      return formatAsJson(entry);
    case 'human':
      return formatAsHumanReadable(entry);
    case 'structured-text':
      return formatAsStructuredText(entry);
    default:
      return formatAsJson(entry);
  }
}

function getMinimumSeverityName(level: number): LogSeverity {
  for (const [name, severityLevel] of Object.entries(severityLevels)) {
    if (severityLevel === level) {
      return name as LogSeverity;
    }
  }
  return 'info';
}

export function createLogger(
  serviceName: string,
  correlationId: string | undefined,
  config: DiagnosticConfig = {},
): Logger {
  const minimumSeverityLevel = config.minimumSeverity
    ? severityLevels[config.minimumSeverity]
    : severityLevels.info;
  const outputFormat = config.outputFormat ?? 'human';

  function log(severity: LogSeverity, message: string, fields?: Record<string, unknown>): void {
    if (severityLevels[severity] < minimumSeverityLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      severity,
      message,
      serviceName,
      correlationId,
      fields: {
        ...config.defaultLoggerArgs,
        ...fields,
      },
    };

    const formattedOutput = formatLogEntry(logEntry, outputFormat);

    if (severity === 'error' || severity === 'fatal') {
      console.error(formattedOutput);
    } else {
      console.log(formattedOutput);
    }
  }

  function formatErrorAsParams(error: unknown): Record<string, unknown> | undefined {
    if (error instanceof Error) {
      return {
        ...(error.name !== 'Error' ? { name: error.name } : {}),
        stack: error.stack,
        ...('toErrorPlainObject' in error && typeof error.toErrorPlainObject === 'function'
          ? error.toErrorPlainObject()
          : {}),
      };
    }

    return {
      error: String(error),
    };
  }

  return {
    debug(message: string, fields?: Record<string, unknown>): void {
      log('debug', message, fields);
    },

    info(message: string, fields?: Record<string, unknown>): void {
      log('info', message, fields);
    },

    warn(message: string, fields?: Record<string, unknown>): void {
      log('warn', message, fields);
    },

    error(
      error: unknown,
      message: string | Record<string, unknown>,
      fields?: Record<string, unknown>,
    ): void {
      const additionalFields = typeof message === 'string' ? fields : message;
      const additionalMessage = typeof message === 'string' ? message : undefined;
      const errorMessage = error instanceof Error ? error.message : undefined;

      log('error', errorMessage ?? additionalMessage ?? String(error), {
        ...formatErrorAsParams(error),
        ...additionalFields,
        ...fields,
        ...(additionalMessage ? { additionalMessage } : {}),
      });
    },

    fatal(
      error: unknown,
      message: string | Record<string, unknown>,
      fields?: Record<string, unknown>,
    ): void {
      const additionalFields = typeof message === 'string' ? fields : message;
      const additionalMessage = typeof message === 'string' ? message : undefined;
      const errorMessage = error instanceof Error ? error.message : undefined;

      log('fatal', errorMessage ?? additionalMessage ?? String(error), {
        ...formatErrorAsParams(error),
        ...additionalFields,
        ...fields,
        ...(additionalMessage ? { additionalMessage } : {}),
      });
    },

    createChild(scopeId: string): Logger {
      const childCorrelationId = correlationId ? `${correlationId}.${scopeId}` : scopeId;

      return createLogger(serviceName, childCorrelationId, {
        minimumSeverity: getMinimumSeverityName(minimumSeverityLevel),
        outputFormat,
      });
    },
  };
}

export function createDiagnosticContext(
  envContext: DefaultEnvContext,
  config: DiagnosticConfig = {},
): DiagnosticContext {
  const correlationIdGenerator = createCorrelationIdGenerator();
  const serviceName = envContext.config.PROCESS_NAME;
  const rootId = config.correlationId ?? correlationIdGenerator.generateRootId();
  const rootLogger = createLogger(serviceName, rootId, config);

  return {
    correlationIdGenerator,
    logger: rootLogger,
    createChildLogger: (correlationId: string) => {
      return createLogger(serviceName, correlationId, config);
    },
    getChildDiagnosticContext: (defaultLoggerArgs?: Record<string, unknown>, scopeId?: string) => {
      return createDiagnosticContext(envContext, {
        ...config,
        correlationId: scopeId ? scopeId + '::' + rootId : rootId,
        defaultLoggerArgs: {
          ...config.defaultLoggerArgs,
          ...defaultLoggerArgs,
        },
      });
    },
  };
}
