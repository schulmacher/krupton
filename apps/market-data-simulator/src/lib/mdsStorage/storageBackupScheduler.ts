import type { MdsStorageContext } from '../../process/mdsStorageProcess/context.js';
import { doStorageBackup, listBackups, removeBackupByName } from './storageBackup.js';

async function removeDuplicateBackupsForLatestDate(
  context: MdsStorageContext,
): Promise<void> {
  const { diagnosticContext } = context;

  try {
    const allBackups = await listBackups(context);
    const latestBackup = [...allBackups].sort((a, b) => b.date.getTime() - a.date.getTime())[0];

    if (!latestBackup) {
      diagnosticContext.logger.warn('Could not extract latest backup', {
        latestBackup,
      });
      return;
    }

    const latestDate = latestBackup.date;

    const duplicatesForDate = allBackups.filter(
      (backup) =>
        backup.date.toISOString().slice(0, 10) === latestDate.toISOString().slice(0, 10) &&
        backup.fileName !== latestBackup.fileName,
    );

    if (duplicatesForDate.length === 0) {
      diagnosticContext.logger.info('No duplicate backups found for date', { date: latestDate });
      return;
    }

    diagnosticContext.logger.info('Removing duplicate backups for date', {
      date: latestDate,
      duplicateCount: duplicatesForDate.length,
      duplicateFileNames: duplicatesForDate.map((b) => b.fileName),
    });

    for (const duplicate of duplicatesForDate) {
      await removeBackupByName(context, duplicate.fileName);
    }

    diagnosticContext.logger.info('Duplicate backups removal completed', {
      date: latestDate,
      removedCount: duplicatesForDate.length,
    });
  } catch (error) {
    diagnosticContext.logger.error('Failed to remove duplicate backups', { error });
  }
}

const performBackup = async (context: MdsStorageContext): Promise<void> => {
  const { diagnosticContext } = context;

  try {
    diagnosticContext.logger.info('Starting scheduled backup');

    const result = await doStorageBackup(context);

    diagnosticContext.logger.info('Scheduled backup completed', {
      backupPath: result.backupPath,
      checksumPath: result.checksumPath,
      checksum: result.checksum,
      sizeMB: (result.size / (1024 * 1024)).toFixed(2),
      durationMs: result.duration,
    });

    context.metricsContext.metrics.backupSuccesses.inc();

    const backupFileName = result.backupPath.split('/').pop();
    if (backupFileName) {
      await removeDuplicateBackupsForLatestDate(context);
      await removeHistoricalBackups(context);
    }
  } catch (error) {
    diagnosticContext.logger.error('Scheduled backup failed', { error });

    context.metricsContext.metrics.backupFailures.inc();
  }
};

async function removeHistoricalBackups(context: MdsStorageContext): Promise<void> {
  const { diagnosticContext } = context;

  try {
    const allBackups = await listBackups(context);

    const maxBackupsToKeep = 7;
    const backupsToRemove = allBackups.length - maxBackupsToKeep;

    if (backupsToRemove <= 0) {
      diagnosticContext.logger.info('No historical backups to remove', {
        currentBackupCount: allBackups.length,
        maxBackupsToKeep,
      });
      return;
    }

    const sortedBackups = allBackups.sort((a, b) => a.date.getTime() - b.date.getTime());
    const backupsToDelete = sortedBackups.slice(0, backupsToRemove);

    diagnosticContext.logger.info('Removing historical backups', {
      currentBackupCount: allBackups.length,
      maxBackupsToKeep,
      backupsToRemoveCount: backupsToRemove,
      fileNamesToRemove: backupsToDelete.map((b) => b.fileName),
    });

    for (const backup of backupsToDelete) {
      await removeBackupByName(context, backup.fileName);
    }

    diagnosticContext.logger.info('Historical backups removal completed', {
      removedCount: backupsToRemove,
      remainingBackupCount: allBackups.length - backupsToRemove,
    });
  } catch (error) {
    diagnosticContext.logger.error('Failed to remove historical backups', { error });
  }
}

export const createStorageBackupScheduler = (
  context: MdsStorageContext,
  backupIntervalMs: number = 3 * 60 * 60 * 1000, // Default: 3 hours
) => {
  const { processContext, diagnosticContext } = context;
  let timeoutId: NodeJS.Timeout | null = null;
  let backupPromise: Promise<void> | null = null;

  const runLoop = async (): Promise<void> => {
    backupPromise = performBackup(context);
    await backupPromise;

    if (!processContext.isShuttingDown()) {
      timeoutId = setTimeout(() => {
        runLoop().catch((error) => {
          diagnosticContext.logger.error('Storage backup scheduler loop failed', { error });
          timeoutId = null;
          processContext.shutdown();
        });
      }, backupIntervalMs);
    }
  };

  return {
    async start(): Promise<void> {
      if (timeoutId !== null) {
        diagnosticContext.logger.warn('Storage backup scheduler already running');
        return;
      }

      diagnosticContext.logger.info('Starting storage backup scheduler', {
        backupIntervalMs,
        backupIntervalHours: backupIntervalMs / (60 * 60 * 1000),
      });

      runLoop().catch((error) => {
        diagnosticContext.logger.error('Storage backup scheduler loop failed', { error });
        timeoutId = null;
        processContext.shutdown();
      });
    },

    async stop(): Promise<void> {
      if (timeoutId === null) {
        diagnosticContext.logger.warn('Storage backup scheduler not running');
        return;
      }

      diagnosticContext.logger.info('Stopping storage backup scheduler');
      if (backupPromise) {
        await backupPromise;
      }
      clearTimeout(timeoutId);
      timeoutId = null;
      backupPromise = null;
      diagnosticContext.logger.info('Storage backup scheduler stopped');
    },
  };
};

export type StorageBackupScheduler = ReturnType<typeof createStorageBackupScheduler>;
