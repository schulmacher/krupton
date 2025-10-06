import type { MdsStorageContext } from '../../process/mdsStorageProcess/context.js';
import { listBackups } from './storageBackup.js';
import { readStorageStats } from './storageStats.js';

async function reportStats(context: MdsStorageContext, baseDir: string): Promise<void> {
  const { diagnosticContext } = context;
  try {
    const stats = await readStorageStats(baseDir);

    for (const dirStats of stats) {
      const directoryLabel = dirStats.directory || 'other';

      context.metricsContext.metrics.directoryStorageSize.set(
        { directory: directoryLabel },
        dirStats.sizeBytes,
      );

      context.metricsContext.metrics.directoryFileCount.set(
        { directory: directoryLabel },
        dirStats.fileCount,
      );

      context.metricsContext.metrics.directoryLastUpdated.set(
        { directory: directoryLabel },
        dirStats.lastUpdated / 1000, // Convert milliseconds to seconds
      );
    }

    const backups = await listBackups(context);

    if (backups.length > 0) {
      const mostRecentBackup = backups.reduce((latest, current) =>
        current.date > latest.date ? current : latest,
      );

      const totalBackupSize = backups.reduce((sum, backup) => sum + backup.sizeBytes, 0);

      context.metricsContext.metrics.backupLastTimestamp.set(
        mostRecentBackup.date.getTime() / 1000, // Convert milliseconds to seconds
      );

      context.metricsContext.metrics.backupSize.set(totalBackupSize);
    }

    diagnosticContext.logger.info('Storage stats reported', {
      directoriesReported: stats.length,
      backupsReported: backups.length,
    });
  } catch (error) {
    diagnosticContext.logger.error('Failed to report storage stats', { error });
  }
}

export function createStorageStatsReporter(
  context: MdsStorageContext,
  baseDir: string,
  reportIntervalMs: number = 60000, // Default: 60 seconds
) {
  const { processContext, diagnosticContext } = context;
  let timeoutId: NodeJS.Timeout | null = null;

  const runLoop = async (): Promise<void> => {
    await reportStats(context, baseDir);

    if (!processContext.isShuttingDown()) {
      timeoutId = setTimeout(() => {
        runLoop().catch((error) => {
          diagnosticContext.logger.error('Storage stats reporter loop failed', { error });
          timeoutId = null;
          processContext.shutdown();
        });
      }, reportIntervalMs);
    }
  };

  return {
    async start(): Promise<void> {
      if (timeoutId !== null) {
        diagnosticContext.logger.warn('Storage stats reporter already running');
        return;
      }

      diagnosticContext.logger.info('Starting storage stats reporter', {
        reportIntervalMs,
        baseDir,
      });

      runLoop().catch((error) => {
        diagnosticContext.logger.error('Storage stats reporter loop failed', { error });
        timeoutId = null;
        processContext.shutdown();
      });
    },

    async stop(): Promise<void> {
      if (timeoutId === null) {
        diagnosticContext.logger.warn('Storage stats reporter not running');
        return;
      }

      diagnosticContext.logger.info('Stopping storage stats reporter');
      clearTimeout(timeoutId);
      timeoutId = null;
      diagnosticContext.logger.info('Storage stats reporter stopped');
    },
  };
}

export type StorageStatsReporter = ReturnType<typeof createStorageStatsReporter>;
