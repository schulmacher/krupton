#!/usr/bin/env node
import { SF } from '@krupton/service-framework-node';
import { createKrakenOrdersTransformerContext } from './process/transformer/krakenOrders/transformerContext.js';
import { startKrakenOrdersTransformerService } from './process/transformer/krakenOrders/transformerProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createKrakenOrdersTransformerContext(processContext);

    await startKrakenOrdersTransformerService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
