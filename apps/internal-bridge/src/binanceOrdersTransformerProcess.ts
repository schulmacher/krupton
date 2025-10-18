#!/usr/bin/env node
import { SF } from '@krupton/service-framework-node';
import { createBinanceOrdersTransformerContext } from './process/transformer/binanceOrders/transformerContext.js';
import { startBinanceOrdersTransformerService } from './process/transformer/binanceOrders/transformerProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createBinanceOrdersTransformerContext(processContext);

    await startBinanceOrdersTransformerService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
