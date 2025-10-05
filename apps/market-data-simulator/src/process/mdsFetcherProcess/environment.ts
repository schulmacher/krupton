import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const mdsFetcherEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'mds-fetcher' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3000 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Platform configuration
  PLATFORM: TB.String({
    description: 'Exchange platform to fetch from (binance, kraken)',
    default: 'binance',
  }),

  API_BASE_URL: TB.String({
    description: 'Base URL for the exchange API',
    default: 'https://testnet.binance.vision',
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
    description: 'Comma-separated list of trading pairs (e.g., BTCUSDT,ETHUSDT)',
    default: 'BTCUSDT',
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

export type MdsFetcherEnv = TB.Static<typeof mdsFetcherEnvSchema>;
