import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../diagnostics/types.js';
import {
  createMockDiagnosticsContext,
  createMockMetricsContext,
  createMockProcessContext,
} from '../test/index.js';
import { createHttpServer } from './httpServer.js';
import type { HealthCheckResult, ServiceContext } from './types.js';

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    createChild: vi.fn(),
  };
}

function createTestServiceContext(): ServiceContext<{
  PORT: number;
  NODE_ENV: string;
}> {
  const config: { PORT: number; NODE_ENV: string } = {
    PORT: 3000,
    NODE_ENV: 'test',
  };

  return {
    envContext: {
      config,
      nodeEnv: 'test',
    },
    diagnosticContext: createMockDiagnosticsContext(),
    metricsContext: createMockMetricsContext(),
    processContext: createMockProcessContext(),
  };
}

describe('createHttpServer', () => {
  describe('server creation', () => {
    it('should create a Fastify server instance', () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      expect(server).toBeDefined();
      expect(typeof server.listen).toBe('function');
      expect(typeof server.inject).toBe('function');
    });

    it('should configure Fastify with correlation ID settings', () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      expect(server.server).toBeDefined();
    });

    it('should decorate server with startServer method', () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      expect(typeof server.startServer).toBe('function');
    });
  });

  describe('request context decoration', () => {
    it('should attach service context to requests', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      server.get('/test', async (request) => {
        expect(request.ctx).toBeDefined();
        expect(request.ctx).toBe(context);
        return { success: true };
      });

      const response = await server.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should attach logger to requests', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      server.get('/test', async (request) => {
        expect(request.logger).toBeDefined();
        expect(typeof request.logger.info).toBe('function');
        return { success: true };
      });

      await server.inject({
        method: 'GET',
        url: '/test',
      });

      expect(context.diagnosticContext.createChildLogger).toHaveBeenCalled();
    });

    it('should attach correlation ID to requests', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      let capturedCorrelationId: string | undefined;

      server.get('/test', async (request) => {
        capturedCorrelationId = request.correlationId;
        return { success: true };
      });

      await server.inject({
        method: 'GET',
        url: '/test',
      });

      expect(capturedCorrelationId).toBeDefined();
      expect(typeof capturedCorrelationId).toBe('string');
      expect(capturedCorrelationId).toMatch(/^req-/);
    });

    it('should use correlation ID from x-correlation-id header if provided', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      let capturedCorrelationId: string | undefined;

      server.get('/test', async (request) => {
        capturedCorrelationId = request.correlationId;
        return { success: true };
      });

      await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-correlation-id': 'custom-correlation-id',
        },
      });

      expect(capturedCorrelationId).toBeDefined();
    });

    it('should attach start time to requests', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      let capturedStartTime: number | undefined;

      server.get('/test', async (request) => {
        capturedStartTime = request.startTime;
        return { success: true };
      });

      const beforeRequest = Date.now();
      await server.inject({
        method: 'GET',
        url: '/test',
      });
      const afterRequest = Date.now();

      expect(capturedStartTime).toBeDefined();
      expect(capturedStartTime).toBeGreaterThanOrEqual(beforeRequest);
      expect(capturedStartTime).toBeLessThanOrEqual(afterRequest);
    });
  });

  describe('request logging', () => {
    it('should log request received', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);
      const mockLogger = createMockLogger();
      vi.mocked(context.diagnosticContext.createChildLogger).mockReturnValue(mockLogger);

      server.get('/test', async () => ({ success: true }));

      await server.inject({
        method: 'GET',
        url: '/test',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Request received',
        expect.objectContaining({
          method: 'GET',
          url: '/test',
        }),
      );
    });

    it('should log request completed with duration', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);
      const mockLogger = createMockLogger();
      vi.mocked(context.diagnosticContext.createChildLogger).mockReturnValue(mockLogger);

      server.get('/test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { success: true };
      });

      await server.inject({
        method: 'GET',
        url: '/test',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          method: 'GET',
          url: '/test',
          statusCode: 200,
          duration_ms: expect.any(Number),
        }),
      );
    });
  });

  describe('/metrics endpoint', () => {
    it('should expose metrics endpoint', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('test_metric');
    });

    it('should call getMetricsAsString from metrics context', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(context.metricsContext.getMetricsAsString).toHaveBeenCalled();
    });
  });

  describe('/health endpoint', () => {
    it('should return healthy status when service is running', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.timestamp).toBeDefined();
      expect(body.components).toEqual([]);
    });

    it('should return unhealthy status when shutting down', async () => {
      const context = createTestServiceContext();
      vi.mocked(context.processContext.isShuttingDown).mockReturnValue(true);
      const server = createHttpServer(context);

      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
    });

    it('should execute health checks and return results', async () => {
      const context = createTestServiceContext();
      const healthCheck1 = vi.fn().mockResolvedValue({
        component: 'database',
        isHealthy: true,
      } satisfies HealthCheckResult);
      const healthCheck2 = vi.fn().mockResolvedValue({
        component: 'cache',
        isHealthy: true,
      } satisfies HealthCheckResult);

      const server = createHttpServer(context, {
        healthChecks: [healthCheck1, healthCheck2],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(healthCheck1).toHaveBeenCalled();
      expect(healthCheck2).toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.components).toEqual([
        { component: 'database', isHealthy: true },
        { component: 'cache', isHealthy: true },
      ]);
    });

    it('should return unhealthy when any health check fails', async () => {
      const context = createTestServiceContext();
      const mockLogger = createMockLogger();
      vi.mocked(context.diagnosticContext.createChildLogger).mockReturnValue(mockLogger);

      const healthCheck1 = vi.fn().mockResolvedValue({
        component: 'database',
        isHealthy: true,
      } satisfies HealthCheckResult);
      const healthCheck2 = vi.fn().mockResolvedValue({
        component: 'cache',
        isHealthy: false,
      } satisfies HealthCheckResult);

      const server = createHttpServer(context, {
        healthChecks: [healthCheck1, healthCheck2],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
      expect(body.components).toEqual([
        { component: 'database', isHealthy: true },
        { component: 'cache', isHealthy: false },
      ]);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Health check failed',
        expect.objectContaining({
          unhealthyComponents: ['cache'],
        }),
      );
    });

    it('should return unhealthy when health check throws error', async () => {
      const context = createTestServiceContext();
      const mockLogger = createMockLogger();
      vi.mocked(context.diagnosticContext.createChildLogger).mockReturnValue(mockLogger);

      const healthCheck = vi.fn().mockRejectedValue(new Error('Connection failed'));

      const server = createHttpServer(context, {
        healthChecks: [healthCheck],
      });

      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');

      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(Error), 'Health check error');
    });

    it('should execute all health checks in parallel', async () => {
      const context = createTestServiceContext();
      let check1Started = false;
      let check2Started = false;
      let check1Completed = false;

      const healthCheck1 = vi.fn().mockImplementation(async () => {
        check1Started = true;
        await new Promise((resolve) => setTimeout(resolve, 50));
        check1Completed = true;
        return {
          component: 'database',
          isHealthy: true,
        } satisfies HealthCheckResult;
      });

      const healthCheck2 = vi.fn().mockImplementation(async () => {
        check2Started = true;
        expect(check1Completed).toBe(false);
        return {
          component: 'cache',
          isHealthy: true,
        } satisfies HealthCheckResult;
      });

      const server = createHttpServer(context, {
        healthChecks: [healthCheck1, healthCheck2],
      });

      await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(check1Started).toBe(true);
      expect(check2Started).toBe(true);
    });
  });

  describe('graceful shutdown', () => {
    it('should register shutdown callback with process context', () => {
      const context = createTestServiceContext();
      createHttpServer(context);

      expect(context.processContext.onShutdown).toHaveBeenCalledTimes(1);
      expect(context.processContext.onShutdown).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should close server on shutdown', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      const closeSpy = vi.spyOn(server, 'close');

      await context.processContext.shutdown();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('startServer method', () => {
    it('should have startServer method available', () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      expect(typeof server.startServer).toBe('function');
    });

    it('should use PORT from env context', async () => {
      const context = createTestServiceContext();
      context.envContext.config.PORT = 4567;
      const server = createHttpServer(context);

      const listenSpy = vi.spyOn(server, 'listen').mockResolvedValue(undefined as never);

      await server.startServer();

      expect(listenSpy).toHaveBeenCalledWith({
        port: 4567,
        host: '0.0.0.0',
      });
    });
  });

  describe('custom routes', () => {
    it('should allow registering custom routes', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      server.get('/custom', async (request) => {
        return {
          correlationId: request.correlationId,
          message: 'custom response',
        };
      });

      const response = await server.inject({
        method: 'GET',
        url: '/custom',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('custom response');
      expect(body.correlationId).toBeDefined();
    });

    it('should provide access to context in custom routes', async () => {
      const context = createTestServiceContext();
      const server = createHttpServer(context);

      server.post('/data', async (request) => {
        expect(request.ctx).toBe(context);
        expect(request.logger).toBeDefined();
        request.logger.info('Processing data');
        return { success: true };
      });

      const response = await server.inject({
        method: 'POST',
        url: '/data',
        payload: { test: 'data' },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
