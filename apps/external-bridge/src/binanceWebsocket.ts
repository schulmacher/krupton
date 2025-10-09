#!/usr/bin/env node

import { createWebsocketContext } from "./process/websocketProcess/context";
import { startWebsocketService } from "./process/websocketProcess/websocketProcess";

async function bootstrap(): Promise<void> {
  try {
    const context = createWebsocketContext();

    context.diagnosticContext.logger.info('Bootstrapping external-bridge websocket service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
      platform: context.envContext.config.PLATFORM,
    });

    await startWebsocketService(context);
  } catch (error) {
    console.error('Failed to bootstrap external-bridge websocket service:', error);
    process.exit(1);
  }
}

void bootstrap();
