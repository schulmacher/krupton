import { SF } from '@krupton/service-framework-node';
import { createStorageBackupService } from '../../lib/mdsStorage/mdsStorageBackupService.js';
import type { MdsStorageContext } from './context.js';

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
  const storageService = createStorageBackupService(context);

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down Storage service');
      await storageService.stop();
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
  await storageService.start();
};
