import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const websocketEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'external-bridge-websocket' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3000 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Platform configuration
  PLATFORM: TB.Union([TB.Literal('binance'), TB.Literal('kraken')], {
    description: 'Exchange platform to fetch from (binance, kraken)',
    default: 'binance',
  }),

  API_BASE_URL: TB.String({
    description: 'Base URL for the websocket streams API',
    default: 'wss://stream.testnet.binance.vision/stream?streams',
  }),

  // Symbol configuration
  SYMBOLS: TB.String({
    description: 'Comma-separated list of trading pairs (e.g., BTCUSDT,ETHUSDT)',
    default: 'BTCUSDT,ETHUSDT',
  }),

  // Storage configuration
  STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage'),
  }),
}) satisfies SF.DefaultEnvSchema;

export type WebsocketEnv = TB.Static<typeof websocketEnvSchema>;
