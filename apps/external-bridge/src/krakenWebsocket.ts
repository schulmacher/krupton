#!/usr/bin/env node

import { SF } from '@krupton/service-framework-node';
import { createKrakenWebsocketContext } from './process/websocketProcess/krakenWebsocketContext.js';
import { startWebsocketService } from './process/websocketProcess/krakenWebsocketProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createKrakenWebsocketContext(processContext);

    await startWebsocketService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
