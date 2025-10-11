#!/usr/bin/env node
import { createKrakenFetcherContext } from './process/fetcherProcess/krakenFetcherContext.js';
import { startKrakenFetcherService } from './process/fetcherProcess/krakenFetcherProcess.js';

async function bootstrap(): Promise<void> {
  try {
    const context = createKrakenFetcherContext();

    context.diagnosticContext.logger.info('Bootstrapping krakenFetcher service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
      platform: context.envContext.config.PLATFORM,
    });

    await startKrakenFetcherService(context);
  } catch (error) {
    console.error('Failed to bootstrap krakenFetcher service:', error);
    process.exit(1);
  }
}

void bootstrap();
