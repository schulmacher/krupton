import { SF } from '@krupton/service-framework-node';
import type { StorageContext } from './context.js';
import { createStorageStatsReporter } from '../../lib/storageBackupAndStats/storageStatsReporter.js';
import { createStorageBackupScheduler } from '../../lib/storageBackupAndStats/storageBackupScheduler.js';

export async function startStorageService(context: StorageContext): Promise<void> {
  const { diagnosticContext, processContext } = context;

  const createHttpServerWithHealthChecks = () =>
    SF.createHttpServer(context, {
      healthChecks: [
        async () => ({
          component: 'Storage',
          isHealthy: true,
        }),
      ],
    });

  const httpServer = createHttpServerWithHealthChecks();
  const storageStatsReporter = createStorageStatsReporter(
    context,
    context.envContext.config.STORAGE_BASE_DIR,
  );
  const storageBackupScheduler = createStorageBackupScheduler(
    context,
    context.envContext.config.BACKUP_INTERVAL_MS,
  );

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down Storage service');
      await storageStatsReporter.stop();
      await storageBackupScheduler.stop();
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
  await storageStatsReporter.start();
  await storageBackupScheduler.start();
}
