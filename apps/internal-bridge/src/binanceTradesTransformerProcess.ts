#!/usr/bin/env node
import { SF } from '@krupton/service-framework-node';
import { createBinanceTradesTransformerContext } from './process/transformer/binanceTrades/transformerContext.js';
import { startBinanceTradesTransformerService } from './process/transformer/binanceTrades/transformerProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createBinanceTradesTransformerContext(processContext);

    await startBinanceTradesTransformerService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
