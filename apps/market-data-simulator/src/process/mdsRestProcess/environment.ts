import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const mdsRestEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'mds-rest-api' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3002 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Storage configuration
  STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for reading stored data',
    default: getMonorepoRootDir('storage'),
  }),
  PLATFORM: TB.String({
    description: 'Platform to read data from',
    default: 'binance',
  }),
}) satisfies SF.DefaultEnvSchema;

export type MdsRestEnv = TB.Static<typeof mdsRestEnvSchema>;
