import { SF } from '@krupton/service-framework-node';
import { TB } from '@krupton/service-framework-node/typebox';
import { getMonorepoRootDir } from '../../lib/fs.js';

export const mdsStorageEnvSchema = TB.Object({
  // Required framework variables
  PROCESS_NAME: TB.String({ default: 'mds-storage' }),
  NODE_ENV: TB.String({ default: 'development' }),
  PORT: TB.Integer({ default: 3000 }),
  LOG_LEVEL: TB.String({ default: 'debug' }),

  // Storage configuration
  STORAGE_BASE_DIR: TB.String({
    description: 'Base directory for storing fetched data',
    default: getMonorepoRootDir('storage'),
  }),
  BACKUP_BASE_DIR: TB.String({
    description: 'Base directory for storing backup data',
    default: getMonorepoRootDir('tmp', 'backup'),
  }),
  BACKUP_INTERVAL_MS: TB.Integer({ default: 3 * 60 * 60 * 1000 }), // Default: 3 hours
  
  // Cloud backup configuration
  CLOUD_BACKUP_TEMP_DIR: TB.String({
    description: 'Temporary directory for cloud backup operations',
    default: '/tmp/cloud-backup-operation/local',
  }),
  RCLONE_REMOTE_NAME: TB.String({
    description: 'Rclone remote name (e.g., "gdrive" for Google Drive)',
    default: 'gdrive',
  }),
  RCLONE_REMOTE_PATH: TB.String({
    description: 'Remote path in rclone (e.g., "backups" folder in Google Drive)',
    default: 'backups',
  }),
  CLOUD_SYNC_ENABLED: TB.Boolean({
    description: 'Enable cloud backup synchronization',
    default: false,
  }),
}) satisfies SF.DefaultEnvSchema;

export type MdsStorageEnv = TB.Static<typeof mdsStorageEnvSchema>;
