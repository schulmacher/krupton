# Service Framework: HTTP Server Management

## Introduction

The server subsystem provides preconfigured Fastify server instances with integrated middleware for diagnostics, metrics, and graceful shutdown. Rather than defining abstract interfaces, the framework returns ready-to-use Fastify servers that automatically handle correlation identifiers, request logging, metrics exposition, and shutdown coordination.

The framework eliminates boilerplate server configuration by providing Fastify instances with essential middleware already configured. Services receive servers that automatically attach diagnostic context to each request, expose Prometheus metrics, and coordinate graceful shutdown with the process lifecycle manager.

## Server Creation

The framework exposes a factory function that creates and configures a Fastify server instance:

```typescript
function createHttpServer(context: ServiceContext): FastifyInstance {
  const fastify = Fastify({
    logger: false, // Use framework diagnostic context instead
    requestIdLogLabel: 'correlationId',
    requestIdHeader: 'x-correlation-id'
  });
  
  // Attach service context to all requests
  fastify.decorateRequest('ctx', null);
  fastify.addHook('onRequest', async (request, reply) => {
    request.ctx = context;
  });
  
  // Create diagnostic context for each request
  fastify.addHook('onRequest', async (request, reply) => {
    const correlationId = request.id || context.diagnosticContext.generateRootId();
    const logger = context.diagnosticContext.createLogger(correlationId);
    
    request.correlationId = correlationId;
    request.logger = logger;
    request.startTime = Date.now();
    
    logger.info('Request received', {
      method: request.method,
      url: request.url
    });
  });
  
  // Log request completion
  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - request.startTime;
    
    request.logger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration_ms: duration
    });
  });
  
  // Expose metrics endpoint using prom-client
  fastify.get('/metrics', async (request, reply) => {
    reply.type(context.metricsContext.getRegistry().contentType);
    return context.metricsContext.getRegistry().metrics();
  });
  
  // Expose health check endpoint
  fastify.get('/health', async (request, reply) => {
    const health = {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
    
    if (context.processContext.isShuttingDown()) {
      reply.code(503);
      health.status = 'unhealthy';
    }
    
    return health;
  });
  
  // Register graceful shutdown
  context.processContext.onShutdown(async () => {
    await fastify.close();
  });
  
  // Decorate with startServer method for convenient startup
  fastify.decorate('startServer', async function() {
    await this.listen({
      port: context.envContext.PORT,
      host: '0.0.0.0'
    });
    
    context.diagnosticContext.logger.info('Server started', {
      port: context.envContext.PORT,
      environment: context.envContext.NODE_ENV
    });
  });
  
  return fastify;
}
```

The factory returns a fully configured Fastify instance with a `startServer()` method that uses environment configuration automatically.

## Request Context Access

Route handlers access the service context and diagnostic logger directly from the Fastify request object:

```typescript
fastify.get('/api/orders/:id', async (request, reply) => {
  const { logger, ctx } = request;
  
  logger.info('Fetching order', { orderId: request.params.id });
  
  try {
    const order = await orderService.getById(request.params.id);
    
    ctx.metricsContext.orderRetrievalCount.inc({ status: 'success' });
    
    return order;
  } catch (error) {
    logger.error(error, 'Order retrieval failed', {
      orderId: request.params.id,
      error: error.message
    });
    
    ctx.metricsContext.orderRetrievalCount.inc({ status: 'error' });
    
    throw error;
  }
});
```

The framework decorates Fastify requests with:
- `request.logger` - Scoped logger with correlation identifier
- `request.correlationId` - Unique request identifier
- `request.ctx` - Full service context reference
- `request.startTime` - Request start timestamp

TypeScript interface definitions for framework extensions:

```typescript
declare module 'fastify' {
  interface FastifyRequest {
    logger: Logger;
    correlationId: string;
    ctx: ServiceContext;
    startTime: number;
  }
  
  interface FastifyInstance {
    startServer(): Promise<void>;
  }
}
```

## Automatic Middleware Configuration

The framework configures essential middleware automatically:

### Diagnostic Context Middleware

Creates a scoped logger with correlation identifier for each request. The correlation identifier is extracted from the `x-correlation-id` header if present, or generated using the diagnostic context.

```typescript
fastify.addHook('onRequest', async (request, reply) => {
  const correlationId = request.id || context.diagnosticContext.generateRootId();
  const logger = context.diagnosticContext.createLogger(correlationId);
  
  request.correlationId = correlationId;
  request.logger = logger;
  request.startTime = Date.now();
});
```

### Request Logging Middleware

Logs request initiation and completion with method, URL, status code, and duration:

```typescript
fastify.addHook('onRequest', async (request, reply) => {
  request.logger.info('Request received', {
    method: request.method,
    url: request.url
  });
});

fastify.addHook('onResponse', async (request, reply) => {
  const duration = Date.now() - request.startTime;
  
  request.logger.info('Request completed', {
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    duration_ms: duration
  });
});
```

### Service Context Attachment

Attaches the full service context to each request, enabling access to all framework subsystems:

```typescript
fastify.decorateRequest('ctx', null);
fastify.addHook('onRequest', async (request, reply) => {
  request.ctx = context;
});
```

## Metrics Exposition

The framework exposes Prometheus metrics using the `prom-client` library through the `/metrics` endpoint:

```typescript
import { register } from 'prom-client';

fastify.get('/metrics', async (request, reply) => {
  reply.type(register.contentType);
  return register.metrics();
});
```

The metrics endpoint returns all registered metrics in Prometheus text format for scraping by VictoriaMetrics. Applications create metrics through the metrics context and they automatically appear in the `/metrics` endpoint response.

### Default HTTP Metrics

The framework can optionally register default HTTP metrics using `prom-client`:

```typescript
import { collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics({
  register: context.metricsContext.getRegistry(),
  prefix: 'nodejs_'
});
```

Default metrics include process CPU usage, memory utilization, event loop lag, and active handles.

## Health Check Endpoint

The `/health` endpoint returns service health status with process uptime:

```typescript
fastify.get('/health', async (request, reply) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
  
  if (context.processContext.isShuttingDown()) {
    reply.code(503);
    health.status = 'unhealthy';
  }
  
  return health;
});
```

During graceful shutdown, the endpoint returns 503 status code with unhealthy status, enabling load balancers to remove the instance from rotation.

## Graceful Shutdown

The framework registers Fastify's graceful shutdown with the process lifecycle manager:

```typescript
context.processContext.onShutdown(async () => {
  await fastify.close();
});
```

When shutdown is initiated, Fastify:
1. Stops accepting new connections
2. Waits for active requests to complete
3. Closes the server socket
4. Releases resources

The process lifecycle manager coordinates shutdown across all components, ensuring HTTP server shutdown completes before process termination.

## Server Startup

Services start the Fastify server after registering routes:

```typescript
async function startService(context: ServiceContext) {
  const fastify = createHttpServer(context);
  
  // Register application routes
  fastify.get('/api/status', async (request, reply) => {
    return { status: 'ok' };
  });
  
  fastify.post('/api/data', async (request, reply) => {
    const { logger } = request;
    logger.info('Processing data submission');
    
    // Handle request
    return { success: true };
  });
  
  // Start server
  await fastify.startServer()
}
```

The framework does not abstract Fastify's API - services use standard Fastify route registration and lifecycle methods.

## Error Handling

Fastify's built-in error handling works seamlessly with the framework's diagnostic context:

```typescript
fastify.setErrorHandler((error, request, reply) => {
  request.logger.error(error, 'Request handler error', {
    error: error.message,
    stack: error.stack
  });
  
  request.ctx.metricsContext.errorCount.inc({
    method: request.method,
    error_type: error.constructor.name
  });
  
  reply.code(error.statusCode || 500).send({
    error: error.message || 'Internal server error',
    correlationId: request.correlationId
  });
});
```

Error handlers access the scoped logger and service context from the request object, maintaining observability during error scenarios.

## Example Service Implementation

Complete example showing framework usage with Fastify:

```typescript
import { createServiceContext, createHttpServer } from './service-framework';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

async function main() {
  const context = createServiceContext(environmentSchema);
  const fastify = createHttpServer(context);
  
  // Register routes
  fastify.get('/api/orders/:id', async (request, reply) => {
    const { logger, ctx } = request;
    const { id } = request.params;
    
    logger.info('Fetching order', { orderId: id });
    
    const order = await orderService.getById(id);
    return order;
  });
  
  // Start process lifecycle (activates signal handlers)
  context.processContext.start();
  
  // Start server with preconfigured port and host
  await fastify.startServer();
}

main().catch((error) => {
  console.error('Service startup failed', error);
  process.exit(1);
});
```

The framework provides preconfigured infrastructure while preserving Fastify's standard API and patterns.

## Conclusion

The service framework provides preconfigured Fastify server instances with essential middleware for diagnostics, metrics exposition, and graceful shutdown. By returning standard Fastify instances with automatic context attachment, the framework eliminates boilerplate configuration while preserving Fastify's familiar API. Route handlers access diagnostic loggers and service context directly from request objects without manual initialization. Graceful shutdown integrates with Fastify's built-in close mechanism through the process lifecycle manager. The metrics endpoint exposes Prometheus metrics using the `prom-client` standard library. This approach balances automation with simplicity, providing infrastructure without abstraction.
