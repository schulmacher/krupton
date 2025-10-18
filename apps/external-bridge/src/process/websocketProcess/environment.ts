import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const binanceWebSocketEnvSchema = TB.Object({
  PROCESS_NAME: TB.String({ default: 'external-bridge-binance-websocket' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3002 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),
  WSS_BASE_URL: TB.String({
    description: 'Base URL for the websocket streams API',
    default: 'wss://stream.binance.com/stream',
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

  SYMBOLS: TB.String({
    description: 'Comma-separated list of trading pairs (e.g., btc_usdt,eth_usdt)',
    default: 'btc_usdt,eth_usdt,sol_usdt,trump_usdt,xrp_usdt',
    // default: 'btc_usdt',
  }),
  STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage', 'external-bridge'),
  }),
}) satisfies SF.DefaultEnvSchemaType;

export type BinanceWebSocketEnv = TB.Static<typeof binanceWebSocketEnvSchema>;

export const krakenWebSocketEnvSchema = TB.Object({
  PROCESS_NAME: TB.String({ default: 'external-bridge-kraken-websocket' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3003 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),
  WSS_BASE_URL: TB.String({
    description: 'Base URL for the websocket streams API',
    default: 'wss://ws.kraken.com/v2',
  }),
  SYMBOLS: TB.String({
    description: 'Comma-separated list of trading pairs (e.g., btc_usdt,eth_usdt)',
    default: 'btc_usdt,eth_usdt,kas_usdt,sol_usdt,trump_usdt,xrp_usdt,wlfi_usd',
  }),
  STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage', 'external-bridge'),
  }),
}) satisfies SF.DefaultEnvSchemaType;

export type KrakenWebSocketEnv = TB.Static<typeof krakenWebSocketEnvSchema>;
