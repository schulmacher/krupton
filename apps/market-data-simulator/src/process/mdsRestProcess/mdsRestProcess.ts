import { SF } from '@krupton/service-framework-node';
import { registerGetRecentTradesEndpoint } from '../../lib/mdsRest/getRecentTrades.js';
import { createStorageIO } from '../../lib/mdsStorage/mdsStorageIO.js';
import type { MdsRestContext } from './context.js';

export const startMdsRestService = async (context: MdsRestContext): Promise<void> => {
  const { diagnosticContext, processContext, envContext } = context;
  const config = envContext.config;

  const httpServer = SF.createHttpServer(context, {
    healthChecks: [
      async () => ({
        component: 'REST API',
        isHealthy: true,
      }),
    ],
  });
  const storageIO = createStorageIO(config.STORAGE_BASE_DIR);

  registerGetRecentTradesEndpoint(httpServer, storageIO, config.STORAGE_BASE_DIR, config.PLATFORM);

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down REST API service');
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();

  diagnosticContext.logger.info('REST API service started', {
    port: config.PORT,
    platform: config.PLATFORM,
    storageBaseDir: config.STORAGE_BASE_DIR,
  });
};
