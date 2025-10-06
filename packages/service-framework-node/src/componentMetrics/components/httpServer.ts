import type { MetricConfigCounter, MetricConfigHistogram } from '../../metrics/types.js';

const httpRequestsTotal: MetricConfigCounter<'method' | 'route' | 'status_code'> = {
  type: 'counter',
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
};

const httpRequestDuration: MetricConfigHistogram<'method' | 'route'> = {
  type: 'histogram',
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
};

export const httpServerMetrics = {
  httpRequestsTotal,
  httpRequestDuration,
};
