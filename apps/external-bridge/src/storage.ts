#!/usr/bin/env node
import { SF } from '@krupton/service-framework-node';
import { createStorageContext } from './process/storageProcess/context.js';
import { startStorageService } from './process/storageProcess/storageProcess.js';

async function bootstrap(): Promise<void> {
  await SF.startProcessLifecycle(async (processContext) => {
    const serviceContext = createStorageContext(processContext);

    serviceContext.diagnosticContext.logger.info('Bootstrapping mdsStorage service', {
      processName: serviceContext.envContext.config.PROCESS_NAME,
      nodeEnv: serviceContext.envContext.nodeEnv,
    });

    await startStorageService(serviceContext);

    return {
      diagnosticContext: serviceContext.diagnosticContext,
      envContext: serviceContext.envContext,
    };
  });
}

void bootstrap();
