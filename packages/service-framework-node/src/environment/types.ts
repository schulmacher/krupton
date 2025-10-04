import type { TSchema, Static } from '@sinclair/typebox';

export interface ParsedEnv<T> {
  readonly config: T;
  readonly errors?: EnvValidationError[];
}

export interface EnvValidationError {
  readonly path: string;
  readonly message: string;
  readonly value?: unknown;
}

export interface EnvParserConfig {
  readonly redactSensitive?: boolean;
  readonly allowUnknown?: boolean;
  readonly source?: Record<string, string | undefined>;
}

export interface EnvParser {
  parse<T extends TSchema>(schema: T, config?: EnvParserConfig): Static<T>;

  validate<T extends TSchema>(
    schema: T,
    source: Record<string, unknown>,
    config?: EnvParserConfig,
  ): ParsedEnv<Static<T>>;
}

export interface EnvContext<T = Record<string, unknown>> {
  readonly config: T;
  readonly nodeEnv: string;
}

export type EnvSource = Record<string, string | undefined>;

export type DefaultEnvSchema = {
  properties: {
    PROCESS_NAME: TSchema;
    [key: string]: TSchema;
  };
};

export interface DefaultEnv {
  PROCESS_NAME: string;
}

export type DefaultEnvContext = EnvContext<DefaultEnv>;
