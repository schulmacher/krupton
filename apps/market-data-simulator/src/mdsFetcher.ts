#!/usr/bin/env node
import { createMdsFetcherContext } from './process/mdsFetcherProcess/context.js';
import { startMdsFetcherService } from './process/mdsFetcherProcess/mdsFetcherProcess.js';

const bootstrap = async (): Promise<void> => {
  try {
    const context = createMdsFetcherContext();

    context.diagnosticContext.logger.info('Bootstrapping mdsFetcher service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
      platform: context.envContext.config.PLATFORM,
    });

    await startMdsFetcherService(context);
  } catch (error) {
    console.error('Failed to bootstrap mdsFetcher service:', error);
    process.exit(1);
  }
};

void bootstrap();
