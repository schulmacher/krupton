import { createMdsRestContext } from './process/mdsRestProcess/context.js';
import { startMdsRestService } from './process/mdsRestProcess/mdsRestProcess.js';

const context = createMdsRestContext();
await startMdsRestService(context);
