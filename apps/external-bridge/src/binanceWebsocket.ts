#!/usr/bin/env node

import { createBinanceWebsocketContext } from "./process/websocketProcess/binanceWebsocketContext";
import { startWebsocketService } from "./process/websocketProcess/binanceWebsocketProcess";

async function bootstrap(): Promise<void> {
  try {
    const context = createBinanceWebsocketContext();

    context.diagnosticContext.logger.info('Bootstrapping external-bridge binance websocket service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
      platform: 'binance',
    });

    await startWebsocketService(context);
  } catch (error) {
    console.error('Failed to bootstrap external-bridge binance websocket service:', error);
    process.exit(1);
  }
}

void bootstrap();
