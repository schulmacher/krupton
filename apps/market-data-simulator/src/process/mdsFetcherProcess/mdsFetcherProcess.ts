import { SF } from '@krupton/service-framework-node';
import { createFetcherService } from '../../lib/mdsFetcher/mdsFetcherService.js';
import type { MdsFetcherContext } from './context.js';

export const startMdsFetcherService = async (context: MdsFetcherContext): Promise<void> => {
  const { diagnosticContext, processContext } = context;
  const logger = diagnosticContext.createRootLogger();

  const createHttpServerWithHealthChecks = () =>
    SF.createHttpServer(context, {
      healthChecks: [
        async () => ({
          component: 'fetcher',
          isHealthy: true,
        }),
      ],
    });

  const httpServer = createHttpServerWithHealthChecks();
  const fetcherService = createFetcherService(context);

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      logger.info('Shutting down fetcher service');
      await fetcherService.stop();
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
  await fetcherService.start();
};
