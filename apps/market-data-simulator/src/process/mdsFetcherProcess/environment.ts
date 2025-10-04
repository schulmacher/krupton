import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const mdsFetcherEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'mds-fetcher' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3000 }),

  // Platform configuration
  PLATFORM: TB.String({
    description: 'Exchange platform to fetch from (binance, kraken)',
    default: 'binance',
  }),

  API_BASE_URL: TB.String({
    description: 'Base URL for the exchange API',
    default: 'https://api.binance.com',
  }),

  // Symbol configuration
  SYMBOLS: TB.String({
    description: 'Comma-separated list of trading pairs (e.g., BTCUSDT,ETHUSDT)',
    default: 'BTCUSDT',
  }),

  // Fetch configuration
  FETCH_INTERVAL_MS: TB.Integer({
    description: 'Interval between fetch operations in milliseconds',
    default: 5000,
    minimum: 1000,
  }),

  // Storage configuration
  STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage'),
  }),

  ROTATION_INTERVAL: TB.String({
    description: 'File rotation interval (e.g., 1h, 1d)',
    default: '1h',
  }),

  // Rate limiting
  RATE_LIMIT_REQUESTS_PER_MINUTE: TB.Integer({
    description: 'Maximum requests per minute',
    default: 1200,
    minimum: 1,
  }),

  RATE_LIMIT_REQUESTS_PER_SECOND: TB.Integer({
    description: 'Maximum requests per second',
    default: 20,
    minimum: 1,
  }),

  // Operational mode
  FETCH_MODE: TB.String({
    description: 'Operational mode: recording, backfill, or snapshot',
    default: 'recording',
    enum: ['recording', 'backfill', 'snapshot'],
  }),
}) satisfies SF.DefaultEnvSchema;

export type MdsFetcherEnv = TB.Static<typeof mdsFetcherEnvSchema>;

