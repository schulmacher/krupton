#!/usr/bin/env node

import { createKrakenWebsocketContext } from "./process/websocketProcess/krakenWebsocketContext";
import { startWebsocketService } from "./process/websocketProcess/krakenWebsocketProcess";

async function bootstrap(): Promise<void> {
  try {
    const context = createKrakenWebsocketContext();

    context.diagnosticContext.logger.info('Bootstrapping external-bridge kraken websocket service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
      platform: 'kraken',
    });

    await startWebsocketService(context);
  } catch (error) {
    console.error('Failed to bootstrap external-bridge kraken websocket service:', error);
    process.exit(1);
  }
}

void bootstrap();
