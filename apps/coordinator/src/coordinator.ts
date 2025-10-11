#!/usr/bin/env node
import { createCoordinatorContext } from './context.js';
import { startCoordinatorService } from './coordinatorService.js';

async function bootstrap(): Promise<void> {
  try {
    const context = createCoordinatorContext();

    context.diagnosticContext.logger.info('Bootstrapping coordinator service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
    });

    await startCoordinatorService(context);
  } catch (error) {
    console.error('Failed to bootstrap coordinator service:', error);
    process.exit(1);
  }
}

void bootstrap();