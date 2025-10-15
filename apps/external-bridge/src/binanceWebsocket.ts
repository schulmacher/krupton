#!/usr/bin/env node

import { SF } from '@krupton/service-framework-node';
import { createBinanceWebsocketContext } from './process/websocketProcess/binanceWebsocketContext';
import { startWebsocketService } from './process/websocketProcess/binanceWebsocketProcess';

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
