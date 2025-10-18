#!/usr/bin/env node
import { SF } from '@krupton/service-framework-node';
import { createKrakenTradesTransformerContext } from './process/transformer/krakenTrades/transformerContext.js';
import { startKrakenTradesTransformerService } from './process/transformer/krakenTrades/transformerProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createKrakenTradesTransformerContext(processContext);

    await startKrakenTradesTransformerService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
