import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const internalBridgeEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'internal-bridge-transformer' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3300 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Storage configuration
  EXTERNAL_BRIDGE_STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage', 'external-bridge'),
  }),
}) satisfies SF.DefaultEnvSchema;

export type TransformerEnv = TB.Static<typeof internalBridgeEnvSchema>;
