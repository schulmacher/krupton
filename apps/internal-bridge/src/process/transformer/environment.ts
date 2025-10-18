import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const binanceTransformerEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'internal-bridge-binance-transformer' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3300 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Storage configuration
  EXTERNAL_BRIDGE_STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage', 'external-bridge'),
  }),

  INTERNAL_BRIDGE_STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage', 'internal-bridge'),
  }),

  SYMBOLS: TB.String({
    description: 'Comma-separated list of normalized symbols',
    default: 'btc_usdt,eth_usdt,sol_usdt,trump_usdt,xrp_usdt',
  }),
}) satisfies SF.DefaultEnvSchemaType;

export type BinanceTransformerEnv = TB.Static<typeof binanceTransformerEnvSchema>;

export const krakenTransformerEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'internal-bridge-kraken-transformer' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3310 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Storage configuration
  EXTERNAL_BRIDGE_STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage', 'external-bridge'),
  }),

  INTERNAL_BRIDGE_STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage', 'internal-bridge'),
  }),

  SYMBOLS: TB.String({
    description: 'Comma-separated list of normalized symbols',
    default: 'btc_usdt,eth_usdt,kas_usdt,sol_usdt,trump_usdt,xrp_usdt,wlfi_usd',
  }),
}) satisfies SF.DefaultEnvSchemaType;

export type KrakenTransformerEnv = TB.Static<typeof krakenTransformerEnvSchema>;
