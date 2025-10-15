#!/usr/bin/env node
import { SF } from '@krupton/service-framework-node';
import { createCoordinatorContext } from './context.js';
import { startCoordinatorService } from './coordinatorService.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const context = createCoordinatorContext(processContext);

    await startCoordinatorService(context);

    return {
      diagnosticContext: context.diagnosticContext,
      envContext: context.envContext,
    };
  });
}

void bootstrap();
