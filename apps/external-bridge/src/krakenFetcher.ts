#!/usr/bin/env node
import { SF } from '@krupton/service-framework-node';
import { createKrakenFetcherContext } from './process/fetcherProcess/krakenFetcherContext.js';
import { startKrakenFetcherService } from './process/fetcherProcess/krakenFetcherProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createKrakenFetcherContext(processContext);

    serviceContext.diagnosticContext.logger.info('Bootstrapping krakenFetcher service', {
      processName: serviceContext.envContext.config.PROCESS_NAME,
      nodeEnv: serviceContext.envContext.nodeEnv,
      platform: serviceContext.envContext.config.PLATFORM,
    });

    await startKrakenFetcherService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
