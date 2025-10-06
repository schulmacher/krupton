import type { EnvContext } from '../environment/types.js';
import type { DiagnosticContext, Logger } from '../diagnostics/types.js';
import type { MetricsContext } from '../metrics/types.js';
import type { ProcessLifecycleContext } from '../processLifecycle/types.js';

export interface ServiceContext<T = Record<string, unknown>, TMetrics = undefined> {
  readonly envContext: EnvContext<T>;
  readonly diagnosticContext: DiagnosticContext;
  readonly metricsContext: MetricsContext<TMetrics>;
  readonly processContext: ProcessLifecycleContext;
}

export interface HealthCheckResult {
  component: string;
  isHealthy: boolean;
}

export interface HttpServerConfig {
  healthChecks?: (() => Promise<HealthCheckResult>)[];
}

declare module 'fastify' {
  interface FastifyRequest {
    logger: Logger;
    correlationId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: ServiceContext<any, any>;
    startTime: number;
  }

  interface FastifyInstance {
    startServer(): Promise<void>;
  }
}
