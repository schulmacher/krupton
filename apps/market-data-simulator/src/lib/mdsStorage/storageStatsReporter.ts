import type { MdsStorageServiceContext } from '../../process/mdsStorageProcess/context.js';
import { readStorageStats } from './storageStats.js';

const reportStats = async (context: MdsStorageServiceContext, baseDir: string): Promise<void> => {
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

    diagnosticContext.logger.info('Storage stats reported', {
      directoriesReported: stats.length,
    });
  } catch (error) {
    diagnosticContext.logger.error('Failed to report storage stats', { error });
  }
};

export const createStorageStatsReporter = (
  context: MdsStorageServiceContext,
  baseDir: string,
  reportIntervalMs: number = 60000, // Default: 60 seconds
) => {
  const { processContext, diagnosticContext } = context;
  let isRunning = false;

  const runLoop = async (): Promise<void> => {
    while (isRunning && !processContext.isShuttingDown()) {
      await reportStats(context, baseDir);
      await new Promise((resolve) => setTimeout(resolve, reportIntervalMs));
    }
  };

  return {
    async start(): Promise<void> {
      if (isRunning) {
        diagnosticContext.logger.warn('Storage stats reporter already running');
        return;
      }

      diagnosticContext.logger.info('Starting storage stats reporter', {
        reportIntervalMs,
        baseDir,
      });

      isRunning = true;

      // Don't await, let it run in background
      runLoop().catch((error) => {
        diagnosticContext.logger.error('Storage stats reporter loop failed', { error });
        isRunning = false;
        processContext.shutdown();
      });
    },

    async stop(): Promise<void> {
      if (!isRunning) {
        diagnosticContext.logger.warn('Storage stats reporter not running');
        return;
      }

      diagnosticContext.logger.info('Stopping storage stats reporter');
      isRunning = false;

      // Wait for the loop to finish
      while (isRunning) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      diagnosticContext.logger.info('Storage stats reporter stopped');
    },
  };
};

export type StorageStatsReporter = ReturnType<typeof createStorageStatsReporter>;
