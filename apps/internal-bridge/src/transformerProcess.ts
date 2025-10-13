#!/usr/bin/env node
import { createTransformerContext } from './process/transformer/transformerContext.js';
import { startTransformerService } from './process/transformer/transformerProcess.js';

async function bootstrap(): Promise<void> {
  try {
    const context = createTransformerContext();

    context.diagnosticContext.logger.info('Bootstrapping internal-bridge transformer service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
    });

    await startTransformerService(context);
  } catch (error) {
    console.error('Failed to bootstrap internal-bridge transformer service:', error);
    process.exit(1);
  }
}

void bootstrap();
