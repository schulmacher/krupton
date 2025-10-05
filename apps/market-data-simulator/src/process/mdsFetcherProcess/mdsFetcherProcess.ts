import { SF } from '@krupton/service-framework-node';
import { createBinanceHistoricalTradesFetcherLoops } from '../../lib/mdsFetcher/createBinanceHistoricalTradesFetcherLoops.js';
import type { MdsFetcherContext } from './context.js';

export const startMdsFetcherService = async (context: MdsFetcherContext): Promise<void> => {
  const { diagnosticContext, processContext, envContext } = context;
  const config = envContext.config;

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

  const symbols = config.SYMBOLS.split(',').map((s) => s.trim());

  const fetcherLoops = await createBinanceHistoricalTradesFetcherLoops({
    context,
    symbols,
  });

  const registerGracefulShutdownCallback = () => {
    processContext.onShutdown(async () => {
      diagnosticContext.logger.info('Shutting down fetcher services');
      await Promise.all(fetcherLoops.map((service) => service.stop()));
    });
  };

  registerGracefulShutdownCallback();

  processContext.start();
  await httpServer.startServer();
  await Promise.all(fetcherLoops.map((service) => service.start()));
};
