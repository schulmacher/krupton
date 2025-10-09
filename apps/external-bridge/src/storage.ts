#!/usr/bin/env node
import { createStorageContext } from './process/storageProcess/context.js';
import { startStorageService } from './process/storageProcess/storageProcess.js';

async function bootstrap(): Promise<void> {
  try {
    const context = createStorageContext();

    context.diagnosticContext.logger.info('Bootstrapping mdsStorage service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
    });

    await startStorageService(context);
  } catch (error) {
    console.error('Failed to bootstrap mdsStorage service:', error);
    process.exit(1);
  }
}

void bootstrap();
