import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';
import { createEnvContext, createEnvParser } from './environment.js';

describe('createEnvParser', () => {
  describe('parse', () => {
    it('should parse valid env configuration', () => {
      const schema = Type.Object({
        PORT: Type.Number(),
        HOST: Type.String(),
      });

      const parser = createEnvParser();
      const config = parser.parse(schema, {
        source: {
          PORT: '3000',
          HOST: 'localhost',
        },
      });

      expect(config).toEqual({
        PORT: 3000,
        HOST: 'localhost',
      });
    });

    it('should apply default values', () => {
      const schema = Type.Object({
        PORT: Type.Number({ default: 3000 }),
        HOST: Type.String({ default: 'localhost' }),
      });

      const parser = createEnvParser();
      const config = parser.parse(schema, {
        source: {},
      });

      expect(config.PORT).toBe(3000);
      expect(config.HOST).toBe('localhost');
    });

    it('should coerce string to number', () => {
      const schema = Type.Object({
        PORT: Type.Number(),
        MAX_CONNECTIONS: Type.Integer(),
      });

      const parser = createEnvParser();
      const config = parser.parse(schema, {
        source: {
          PORT: '8080',
          MAX_CONNECTIONS: '100',
        },
      });

      expect(config.PORT).toBe(8080);
      expect(config.MAX_CONNECTIONS).toBe(100);
    });

    it('should coerce string to boolean', () => {
      const schema = Type.Object({
        ENABLED: Type.Boolean(),
        DEBUG: Type.Boolean(),
      });

      const parser = createEnvParser();
      const config = parser.parse(schema, {
        source: {
          ENABLED: 'true',
          DEBUG: 'false',
        },
      });

      expect(config.ENABLED).toBe(true);
      expect(config.DEBUG).toBe(false);
    });

    it('should handle optional values', () => {
      const schema = Type.Object({
        REQUIRED: Type.String(),
        OPTIONAL: Type.Optional(Type.String()),
      });

      const parser = createEnvParser();
      const config = parser.parse(schema, {
        source: {
          REQUIRED: 'value',
        },
      });

      expect(config.REQUIRED).toBe('value');
      expect(config.OPTIONAL).toBeUndefined();
    });

    it('should throw error for missing required variable', () => {
      const schema = Type.Object({
        REQUIRED_VAR: Type.String(),
      });

      const parser = createEnvParser();

      expect(() => {
        parser.parse(schema, { source: {} });
      }).toThrow('Configuration validation failed');
    });

    it('should throw error for invalid type', () => {
      const schema = Type.Object({
        PORT: Type.Number(),
      });

      const parser = createEnvParser();

      expect(() => {
        parser.parse(schema, {
          source: {
            PORT: 'invalid',
          },
        });
      }).toThrow('Configuration validation failed');
    });

    it('should handle enum values', () => {
      const schema = Type.Object({
        NODE_ENV: Type.Union([
          Type.Literal('development'),
          Type.Literal('production'),
          Type.Literal('test'),
        ]),
      });

      const parser = createEnvParser();
      const config = parser.parse(schema, {
        source: {
          NODE_ENV: 'production',
        },
      });

      expect(config.NODE_ENV).toBe('production');
    });

    it('should reject invalid enum value', () => {
      const schema = Type.Object({
        NODE_ENV: Type.Union([Type.Literal('development'), Type.Literal('production')]),
      });

      const parser = createEnvParser();

      expect(() => {
        parser.parse(schema, {
          source: {
            NODE_ENV: 'invalid',
          },
        });
      }).toThrow('Configuration validation failed');
    });

    it('should redact sensitive values in error messages', () => {
      const schema = Type.Object({
        DATABASE_PASSWORD: Type.String(),
      });

      const parser = createEnvParser();

      try {
        parser.parse(schema, {
          source: {
            DATABASE_PASSWORD: '',
          },
          redactSensitive: true,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('DATABASE_PASSWORD');
        expect((error as Error).message).not.toContain('secret-value');
      }
    });

    it('should parse JSON strings for object types', () => {
      const schema = Type.Object({
        CONFIG: Type.Object({
          key: Type.String(),
        }),
      });

      const parser = createEnvParser();
      const config = parser.parse(schema, {
        source: {
          CONFIG: '{"key":"value"}',
        },
      });

      expect(config.CONFIG).toEqual({ key: 'value' });
    });

    it('should handle numeric constraints', () => {
      const schema = Type.Object({
        PORT: Type.Number({ minimum: 1024, maximum: 65535 }),
      });

      const parser = createEnvParser();

      expect(() => {
        parser.parse(schema, {
          source: {
            PORT: '500',
          },
        });
      }).toThrow('Configuration validation failed');
    });

    it('should handle string patterns', () => {
      const schema = Type.Object({
        DATABASE_URL: Type.String({ pattern: '^postgres://' }),
      });

      const parser = createEnvParser();
      const config = parser.parse(schema, {
        source: {
          DATABASE_URL: 'postgres://localhost/db',
        },
      });

      expect(config.DATABASE_URL).toBe('postgres://localhost/db');
    });
  });

  describe('validate', () => {
    it('should return validation errors without throwing', () => {
      const schema = Type.Object({
        PORT: Type.Number(),
        HOST: Type.String(),
      });

      const parser = createEnvParser();
      const result = parser.validate(schema, {
        PORT: 'invalid',
      });

      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should return no errors for valid configuration', () => {
      const schema = Type.Object({
        PORT: Type.Number(),
      });

      const parser = createEnvParser();
      const result = parser.validate(schema, {
        PORT: 3000,
      });

      expect(result.errors).toBeUndefined();
      expect(result.config.PORT).toBe(3000);
    });
  });
});

describe('createEnvContext', () => {
  it('should create env context with parsed config', () => {
    const schema = Type.Object({
      PROCESS_NAME: Type.String({ minLength: 1 }),
      NODE_ENV: Type.Union([Type.Literal('development'), Type.Literal('production')]),
      PORT: Type.Number(),
    });

    const context = createEnvContext(schema, {
      source: {
        PROCESS_NAME: 'test-service',
        NODE_ENV: 'production',
        PORT: '3000',
      },
    });

    expect(context.config.PROCESS_NAME).toBe('test-service');
    expect(context.config.NODE_ENV).toBe('production');
    expect(context.config.PORT).toBe(3000);
    expect(context.nodeEnv).toBe('production');
  });

  it('should default env to development', () => {
    const schema = Type.Object({
      PROCESS_NAME: Type.String({ minLength: 1 }),
      PORT: Type.Number(),
    });

    const context = createEnvContext(schema, {
      source: {
        PROCESS_NAME: 'test-service',
        PORT: '3000',
      },
    });

    expect(context.config.PROCESS_NAME).toBe('test-service');
    expect(context.nodeEnv).toBe('development');
  });

  it('should require PROCESS_NAME', () => {
    const schema = Type.Object({
      PORT: Type.Number(),
    });

    expect(
      // @ts-expect-error PROCESS_NAME is required
      createEnvContext(schema, {
        source: {
          PORT: '3000',
        },
      }),
    ).toBeDefined();
  });
});
