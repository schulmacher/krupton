import type { MdsStorageServiceContext } from '../../process/mdsStorageProcess/context.js';
import { createStorageIO } from './mdsStorageIO.js';
import { createStorageBackup } from './mdsStorageBackup.js';

export const createStorageBackupService = (context: MdsStorageServiceContext) => {
  const { envContext, diagnosticContext, metricsContext } = context;
  const logger = diagnosticContext.createRootLogger();
  const config = envContext.config;

  const storageIO = createStorageIO(config.STORAGE_BASE_DIR);
  const storageBackup = createStorageBackup(config.STORAGE_BASE_DIR, config.BACKUP_BASE_DIR);

  const updateMetrics = async (): Promise<void> => {
    const stats = await storageIO.getStorageStats();
    const backupMetadata = storageBackup.getBackupMetadata();

    logger.debug('Updating storage metrics', {
      totalSize: stats.totalSizeBytes,
      fileCount: stats.fileCount,
      lastBackup: backupMetadata.lastBackupTimestamp,
    });

    metricsContext.metrics.storageSize.set(stats.totalSizeBytes);
    metricsContext.metrics.fileCount.set(stats.fileCount);
    metricsContext.metrics.backupLastTimestamp.set(backupMetadata.lastBackupTimestamp / 1000);
    metricsContext.metrics.backupSize.set(storageBackup.getTotalBackupSize());

    for (const [platform, platformStats] of Object.entries(stats.platformStats)) {
      metricsContext.metrics.fileCount.set({ platform }, platformStats.fileCount);
    }
  };

  return {
    async start(): Promise<void> {
      logger.info('Starting storage service', {
        storageBaseDir: config.STORAGE_BASE_DIR,
        backupBaseDir: config.BACKUP_BASE_DIR,
      });

      await storageBackup.start();
      await updateMetrics();

      setInterval(
        () => {
          updateMetrics().catch((error) => {
            logger.error('Error updating metrics', { error });
          });
        },
        60 * 1000,
      );

      logger.info('Storage service started');
    },

    async stop(): Promise<void> {
      logger.info('Stopping storage service');
      await storageBackup.stop();
      logger.info('Storage service stopped');
    },

    getStorageIO: () => storageIO,
    getStorageBackup: () => storageBackup,
  };
};

export type StorageService = ReturnType<typeof createStorageBackupService>;

