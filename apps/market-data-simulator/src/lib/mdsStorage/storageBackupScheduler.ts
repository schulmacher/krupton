import type { MdsStorageContext } from '../../process/mdsStorageProcess/context.js';
import {
  doStorageBackup,
  listBackups,
  removeDuplicateBackupsForLatestDate,
  removeHistoricalBackups,
} from './storageBackup.js';

async function performBackup(context: MdsStorageContext): Promise<void> {
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
}

async function calculateNextBackupDelay(
  context: MdsStorageContext,
  backupIntervalMs: number,
): Promise<number> {
  const { diagnosticContext } = context;

  try {
    const allBackups = await listBackups(context);

    if (allBackups.length === 0) {
      diagnosticContext.logger.info('No existing backups found, scheduling immediate backup');
      return 0;
    }

    const latestBackup = [...allBackups].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    const timeSinceLastBackup = Date.now() - latestBackup.date.getTime();

    // Handle case where last backup date is in the future (shouldn't happen in production)
    // or when backup was made more than the interval ago
    if (timeSinceLastBackup <= 0 || timeSinceLastBackup >= backupIntervalMs) {
      diagnosticContext.logger.info('Scheduling immediate backup', {
        lastBackupDate: latestBackup.date,
        timeSinceLastBackupMs: timeSinceLastBackup,
        timeSinceLastBackupHours: (timeSinceLastBackup / (60 * 60 * 1000)).toFixed(2),
        reason:
          timeSinceLastBackup <= 0
            ? 'last backup date is in the future'
            : 'last backup exceeds interval',
      });
      return 0;
    }

    const nextBackupDelay = backupIntervalMs - timeSinceLastBackup;
    diagnosticContext.logger.info('Calculated next backup delay based on last backup', {
      lastBackupDate: latestBackup.date,
      timeSinceLastBackupMs: timeSinceLastBackup,
      timeSinceLastBackupHours: (timeSinceLastBackup / (60 * 60 * 1000)).toFixed(2),
      nextBackupDelayMs: nextBackupDelay,
      nextBackupDelayHours: (nextBackupDelay / (60 * 60 * 1000)).toFixed(2),
    });

    return nextBackupDelay;
  } catch (error) {
    diagnosticContext.logger.error(
      'Failed to calculate next backup delay, defaulting to immediate backup',
      {
        error,
      },
    );
    return 0;
  }
}

export function createStorageBackupScheduler(
  context: MdsStorageContext,
  backupIntervalMs: number = 3 * 60 * 60 * 1000, // Default: 3 hours
) {
  const { processContext, diagnosticContext } = context;
  let timeoutId: NodeJS.Timeout | null = null;
  let backupPromise: Promise<void> | null = null;

  function scheduleNextBackup(delayMs: number): void {
    if (!processContext.isShuttingDown()) {
      timeoutId = setTimeout(() => {
        runLoop().catch((error) => {
          diagnosticContext.logger.error('Storage backup scheduler loop failed', { error });
          timeoutId = null;
          processContext.shutdown();
        });
      }, delayMs);
    }
  }

  async function runLoop(): Promise<void> {
    backupPromise = performBackup(context);
    await backupPromise;

    // After performing a backup, wait the full interval before the next one
    scheduleNextBackup(backupIntervalMs);
  }

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

      // Calculate initial delay based on when the last backup was made
      const initialDelay = await calculateNextBackupDelay(context, backupIntervalMs);

      diagnosticContext.logger.info('Scheduling first backup', {
        delayMs: initialDelay,
        delayHours: (initialDelay / (60 * 60 * 1000)).toFixed(2),
      });

      scheduleNextBackup(initialDelay);
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
}

export type StorageBackupScheduler = ReturnType<typeof createStorageBackupScheduler>;
