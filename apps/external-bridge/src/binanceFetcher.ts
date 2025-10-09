#!/usr/bin/env node
import { createExternalBridgeFetcherContext } from './process/fetcherProcess/context.js';
import { startExternalBridgeFetcherService } from './process/fetcherProcess/fetcherProcess.js';

async function bootstrap(): Promise<void> {
  try {
    const context = createExternalBridgeFetcherContext();

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
