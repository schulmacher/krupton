import { randomUUID } from 'node:crypto';
import type { DefaultEnvContext } from '../environment/types.js';
import type {
  Logger,
  LogSeverity,
  LogEntry,
  LogOutputFormat,
  CorrelationIdGenerator,
  DiagnosticConfig,
  DiagnosticContext,
} from './types.js';

const severityLevels: Record<LogSeverity, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
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
  const severityColors: Record<LogSeverity, string> = {
    debug: '\x1b[36m',
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    fatal: '\x1b[35m',
  };

  const resetColor = '\x1b[0m';
  const severityColor = severityColors[entry.severity];
  const severityText = entry.severity.toUpperCase().padEnd(5);

  const correlationPart = entry.correlationId ? ` [${entry.correlationId}]` : '';

  const fieldsPart = entry.fields ? ` ${JSON.stringify(entry.fields)}` : '';

  return `${entry.timestamp} ${severityColor}${severityText}${resetColor} [${entry.serviceName}]${correlationPart} ${entry.message}${fieldsPart}`;
}

function formatAsStructuredText(entry: LogEntry): string {
  const parts: string[] = [
    `timestamp=${entry.timestamp}`,
    `severity=${entry.severity}`,
    `service_name=${entry.serviceName}`,
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
  const outputFormat = config.outputFormat ?? 'json';

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
      fields,
    };

    const formattedOutput = formatLogEntry(logEntry, outputFormat);

    if (severity === 'error' || severity === 'fatal') {
      console.error(formattedOutput);
    } else {
      console.log(formattedOutput);
    }
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

    error(message: string, fields?: Record<string, unknown>): void {
      log('error', message, fields);
    },

    fatal(message: string, fields?: Record<string, unknown>): void {
      log('fatal', message, fields);
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

  return {
    correlationIdGenerator,
    createRootLogger: () => {
      const rootId = correlationIdGenerator.generateRootId();
      return createLogger(serviceName, rootId, config);
    },
    createChildLogger: (correlationId: string) => {
      return createLogger(serviceName, correlationId, config);
    },
  };
}
