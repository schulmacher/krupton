import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const binanceFetcherEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'external-bridge-fetcher' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3000 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Platform configuration
  PLATFORM: TB.Union([TB.Literal('binance')], {
    description: 'Exchange platform for logging',
    default: 'binance',
  }),

  API_BASE_URL: TB.String({
    description: 'Base URL for the exchange API',
    default: 'https://api1.binance.com',
  }),

  API_KEY: TB.Optional(
    TB.String({
      description: 'API key for authenticated endpoints (optional for public endpoints)',
    }),
  ),

  API_SECRET: TB.Optional(
    TB.String({
      description: 'API secret for signing authenticated requests (optional for public endpoints)',
    }),
  ),

  // Symbol configuration
  SYMBOLS: TB.String({
    description: 'Comma-separated list of trading pairs (e.g., btc_usdt,eth_usdt)',
    default: 'btc_usdt,eth_usdt',
  }),

  // Fetch configuration
  FETCH_INTERVAL_MS: TB.Integer({
    description: 'Interval between fetch operations in milliseconds',
    default: 0,
  }),

  // Rate limit configuration
  RATE_LIMIT_MAX_REQUESTS: TB.Integer({
    description: 'Maximum number of requests allowed in the rate limit window',
    default: 2400,
    minimum: 1,
  }),

  RATE_LIMIT_WINDOW_MS: TB.Integer({
    description: 'Rate limit window duration in milliseconds',
    default: 60000,
    minimum: 1000,
  }),

  // Storage configuration
  STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage'),
  }),
}) satisfies SF.DefaultEnvSchema;

export type BinanceFetcherEnv = TB.Static<typeof binanceFetcherEnvSchema>;

export const krakenFetcherEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'external-bridge-fetcher' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3000 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Platform configuration
  PLATFORM: TB.Union([TB.Literal('kraken')], {
    description: 'Exchange platform for logging',
    default: 'kraken',
  }),

  API_BASE_URL: TB.String({
    description: 'Base URL for the exchange API',
    default: 'https://api.kraken.com/0',
  }),

  API_KEY: TB.Optional(
    TB.String({
      description: 'API key for authenticated endpoints (optional for public endpoints)',
    }),
  ),

  API_SECRET: TB.Optional(
    TB.String({
      description: 'API secret for signing authenticated requests (optional for public endpoints)',
    }),
  ),

  // Symbol configuration
  SYMBOLS: TB.String({
    description: 'Comma-separated list of trading pairs (e.g., btc_usdt,eth_usdt)',
    default: 'btc_usdt,eth_usdt',
  }),

  // Fetch configuration
  FETCH_INTERVAL_MS: TB.Integer({
    description: 'Interval between fetch operations in milliseconds',
    default: 0,
  }),

  // Rate limit configuration
  // Without api key the limit is 1 per second
  RATE_LIMIT_MAX_REQUESTS: TB.Integer({
    description: 'Maximum number of requests allowed in the rate limit window',
    default: 1,
    minimum: 1,
  }),

  RATE_LIMIT_WINDOW_MS: TB.Integer({
    description: 'Rate limit window duration in milliseconds',
    default: 1000,
    minimum: 1000,
  }),

  // Storage configuration
  STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage'),
  }),
}) satisfies SF.DefaultEnvSchema;

export type KrakenFetcherEnv = TB.Static<typeof krakenFetcherEnvSchema>;
