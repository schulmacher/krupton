import { SF } from '@krupton/service-framework-node';
// import { createStorageBackupService } from '../../lib/mdsStorage/mdsStorageBackupService.js';
import type { MdsStorageContext } from './context.js';
import { createStorageStatsReporter } from '../../lib/mdsStorage/storageStatsReporter.js';

export const startMdsStorageService = async (context: MdsStorageContext): Promise<void> => {
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
  // const storageService = createStorageBackupService(context);
  const storageStatsReporter = createStorageStatsReporter(context, context.envContext.config.STORAGE_BASE_DIR);

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down Storage service');
      // await storageService.stop();
      await storageStatsReporter.stop();
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
  // await storageService.start();
  await storageStatsReporter.start();
};
