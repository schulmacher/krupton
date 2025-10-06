import Fastify, { type FastifyInstance } from 'fastify';
import type { HttpServerConfig, ServiceContext } from './types.js';
import { httpServerMetrics } from '../componentMetrics/componentMetrics.js';

interface HttpServerEnv {
  PORT: number;
  NODE_ENV: string;
}

export function createHttpServer<T extends HttpServerEnv, TMetrics = undefined>(
  context: ServiceContext<T, TMetrics>,
  config: HttpServerConfig = {},
): FastifyInstance {
  const fastify = Fastify({
    logger: false,
    requestIdLogLabel: 'correlationId',
    requestIdHeader: 'x-correlation-id',
  });

  const httpRequestsTotal = context.metricsContext.createCounter(
    httpServerMetrics.httpRequestsTotal,
  );
  const httpRequestDuration = context.metricsContext.createHistogram(
    httpServerMetrics.httpRequestDuration,
  );

  fastify.decorateRequest('ctx');
  fastify.decorateRequest('logger');
  fastify.decorateRequest('correlationId');
  fastify.decorateRequest('startTime');

  fastify.addHook('onRequest', async (request) => {
    request.ctx = context;
  });

  fastify.addHook('onRequest', async (request) => {
    const correlationId =
      request.id || context.diagnosticContext.correlationIdGenerator.generateRootId();
    const logger = context.diagnosticContext.createChildLogger(correlationId);

    request.correlationId = correlationId;
    request.logger = logger;
    request.startTime = Date.now();

    logger.info('Request received', {
      method: request.method,
      url: request.url,
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;

    request.logger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration_ms: duration,
    });

    const route = request.routeOptions?.url || request.url;
    const durationSeconds = duration / 1000;

    httpRequestsTotal.inc({
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    });

    httpRequestDuration.observe(
      {
        method: request.method,
        route,
      },
      durationSeconds,
    );
  });

  fastify.get('/metrics', async (_request, reply) => {
    const contentType = context.metricsContext.getRegistry().contentType;
    reply.type(contentType);
    return context.metricsContext.getMetricsAsString();
  });

  fastify.get('/health', async (request, reply) => {
    const health = {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      components: [] as Array<{ component: string; isHealthy: boolean }>,
    };

    if (context.processContext.isShuttingDown()) {
      reply.code(503);
      return { ...health, status: 'unhealthy' };
    }

    if (config.healthChecks && config.healthChecks.length > 0) {
      try {
        const checkResults = await Promise.all(config.healthChecks.map((check) => check()));
        health.components = checkResults;

        const allHealthy = checkResults.every((result) => result.isHealthy);

        if (!allHealthy) {
          const unhealthyComponents = checkResults
            .filter((result) => !result.isHealthy)
            .map((result) => result.component);

          request.logger.warn('Health check failed', {
            unhealthyComponents,
            results: checkResults,
          });
          reply.code(503);
          return { ...health, status: 'unhealthy' };
        }
      } catch (error) {
        request.logger.error('Health check error', {
          error: error instanceof Error ? error.message : String(error),
        });
        reply.code(503);
        return { ...health, status: 'unhealthy' };
      }
    }

    return health;
  });

  context.processContext.onShutdown(async () => {
    await fastify.close();
  });

  fastify.decorate('startServer', async function (this: FastifyInstance) {
    await this.listen({
      port: context.envContext.config.PORT,
      host: '0.0.0.0',
    });

    context.diagnosticContext.logger.info('Server started', {
      port: context.envContext.config.PORT,
      environment: context.envContext.config.NODE_ENV,
    });
  });

  return fastify;
}
