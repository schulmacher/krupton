#!/usr/bin/env node
import { SF } from '@krupton/service-framework-node';
import { createBinanceFetcherContext } from './process/fetcherProcess/binanceFetcherContext.js';
import { startExternalBridgeFetcherService } from './process/fetcherProcess/binanceFetcherProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createBinanceFetcherContext(processContext);

    await startExternalBridgeFetcherService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
