import { Value } from '@sinclair/typebox/value';
import { TB } from '../typebox.js';
import type {
  DefaultEnvSchema,
  EnvContext,
  EnvParser,
  EnvParserConfig,
  EnvSource,
  EnvValidationError,
  ParsedEnv,
} from './types.js';

const SENSITIVE_PATTERNS = [/password/i, /secret/i, /key/i, /token/i, /credential/i, /auth/i];

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(key))) {
    return '[REDACTED]';
  }
  return value;
}

function coerceEnvironmentValue(value: string | undefined, targetType: string): unknown {
  if (value === undefined || value === '') {
    return undefined;
  }

  switch (targetType) {
    case 'number':
    case 'integer': {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        throw new Error(`Cannot convert "${value}" to number`);
      }
      return parsed;
    }
    case 'boolean': {
      const lower = value.toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(lower)) return true;
      if (['false', '0', 'no', 'off'].includes(lower)) return false;
      throw new Error(`Cannot convert "${value}" to boolean`);
    }
    case 'object':
    case 'array': {
      try {
        return JSON.parse(value);
      } catch {
        throw new Error(`Cannot parse "${value}" as JSON`);
      }
    }
    default:
      return value;
  }
}

function formatValidationErrors(errors: EnvValidationError[], redactSensitive: boolean): string {
  const lines = ['Configuration validation failed:'];

  for (const error of errors) {
    const value =
      redactSensitive && error.path ? redactValue(error.path, error.value) : error.value;

    const valuePart = value !== undefined ? `, received ${JSON.stringify(value)}` : '';
    lines.push(`  - ${error.path}: ${error.message}${valuePart}`);
  }

  return lines.join('\n');
}

function extractSchemaType(schema: TB.TSchema): string {
  if ('type' in schema && typeof schema.type === 'string') {
    return schema.type;
  }
  if ('anyOf' in schema || 'oneOf' in schema) {
    return 'union';
  }
  return 'unknown';
}

function coerceEnvValues(source: EnvSource, schema: TB.TSchema): Record<string, unknown> {
  const coerced: Record<string, unknown> = {};

  if (!('properties' in schema) || typeof schema.properties !== 'object') {
    return source as Record<string, unknown>;
  }

  const properties = schema.properties as Record<string, TB.TSchema>;

  for (const [key, propSchema] of Object.entries(properties)) {
    const value = source[key];

    if (value === undefined || value === '') {
      coerced[key] = undefined;
      continue;
    }

    try {
      const targetType = extractSchemaType(propSchema);
      coerced[key] = coerceEnvironmentValue(value, targetType);
    } catch {
      coerced[key] = value;
    }
  }

  return coerced;
}

function convertTypeBoxErrors(
  errors: ReturnType<typeof Value.Errors>,
  redactSensitive: boolean,
): EnvValidationError[] {
  const validationErrors: EnvValidationError[] = [];

  for (const error of errors) {
    const path = error.path.replace(/^\//, '').replace(/\//g, '.');
    const value = redactSensitive ? redactValue(path, error.value) : error.value;

    validationErrors.push({
      path: path || 'root',
      message: error.message,
      value,
    });
  }

  return validationErrors;
}

export function createEnvParser(): EnvParser {
  const validate = <T extends TB.TSchema>(
    schema: T,
    source: Record<string, unknown>,
    config: EnvParserConfig = {},
  ): ParsedEnv<TB.Static<T>> => {
    const redactSensitive = config.redactSensitive ?? true;

    const isValid = Value.Check(schema, source);

    if (!isValid) {
      const errors = Value.Errors(schema, source);
      const validationErrors = convertTypeBoxErrors(errors, redactSensitive);

      return {
        config: source as TB.Static<T>,
        errors: validationErrors,
      };
    }

    return {
      config: source as TB.Static<T>,
    };
  };

  const parse = <T extends TB.TSchema>(schema: T, config: EnvParserConfig = {}): TB.Static<T> => {
    const source = config.source ?? process.env;
    const redactSensitive = config.redactSensitive ?? true;

    const coerced = coerceEnvValues(source, schema);
    const withDefaults = Value.Default(schema, coerced) as Record<string, unknown>;

    const result = validate(schema, withDefaults, { redactSensitive });

    if (result.errors && result.errors.length > 0) {
      const errorMessage = formatValidationErrors(result.errors, redactSensitive);
      throw new Error(errorMessage);
    }

    return result.config;
  };

  return {
    parse,
    validate,
  };
}

export function createEnvContext<T extends TB.TSchema & DefaultEnvSchema>(
  schema: T,
  config?: EnvParserConfig,
): EnvContext<TB.Static<T>> {
  const parser = createEnvParser();
  const parsedConfig = parser.parse(schema, config);

  const nodeEnv =
    parsedConfig &&
    typeof parsedConfig === 'object' &&
    'NODE_ENV' in parsedConfig &&
    typeof parsedConfig.NODE_ENV === 'string'
      ? parsedConfig.NODE_ENV
      : 'development';

  return {
    config: parsedConfig,
    nodeEnv,
  };
}
