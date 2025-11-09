#!/usr/bin/env node

import { SF } from '@krupton/service-framework-node';
import { createBinanceWebsocketContext } from './process/websocketProcess/binanceWebsocketContext.js';
import { startWebsocketService } from './process/websocketProcess/binanceWebsocketProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createBinanceWebsocketContext(processContext);

    await startWebsocketService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
