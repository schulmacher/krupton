#!/usr/bin/env node
import { createMdsStorageContext } from './process/mdsStorageProcess/context.js';
import { startMdsStorageService } from './process/mdsStorageProcess/mdsStorageProcess.js';

async function bootstrap(): Promise<void> {
  try {
    const context = createMdsStorageContext();

    context.diagnosticContext.logger.info('Bootstrapping mdsStorage service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
    });

    await startMdsStorageService(context);
  } catch (error) {
    console.error('Failed to bootstrap mdsStorage service:', error);
    process.exit(1);
  }
}

void bootstrap();
