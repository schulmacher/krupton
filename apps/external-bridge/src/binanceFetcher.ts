#!/usr/bin/env node
import { createBinanceFetcherContext } from './process/fetcherProcess/binanceFetcherContext.js';
import { startExternalBridgeFetcherService } from './process/fetcherProcess/binanceFetcherProcess.js';

async function bootstrap(): Promise<void> {
  try {
    const context = createBinanceFetcherContext();

    context.diagnosticContext.logger.info('Bootstrapping externalBridgeFetcher service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
      platform: context.envContext.config.PLATFORM,
    });

    await startExternalBridgeFetcherService(context);
  } catch (error) {
    console.error('Failed to bootstrap externalBridgeFetcher service:', error);
    process.exit(1);
  }
}

void bootstrap();
