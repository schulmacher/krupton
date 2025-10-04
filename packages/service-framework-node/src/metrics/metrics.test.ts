import { describe, it, expect, beforeEach } from 'vitest';
import { createMetricsContext } from './metrics.js';
import type { DefaultEnvContext } from '../environment/types.js';

const createMockEnvContext = (processName = 'test-service'): DefaultEnvContext => ({
  config: {
    PROCESS_NAME: processName,
  },
  nodeEnv: 'test',
});

describe('createMetricsContext', () => {
  describe('registry management', () => {
    it('should provide access to the metrics registry', () => {
      const metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
      });
      const registry = metricsContext.getRegistry();

      expect(registry).toBeDefined();
      expect(typeof registry.metrics).toBe('function');
    });

    it('should clear all metrics', () => {
      const metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
      });

      metricsContext.createCounter({
        name: 'test_counter',
        help: 'Test counter',
      });

      metricsContext.clearMetrics();

      const metrics = metricsContext.getMetrics();
      expect(metrics).toHaveLength(0);
    });
  });

  describe('counter metrics', () => {
    let metricsContext: ReturnType<typeof createMetricsContext>;

    beforeEach(() => {
      metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
      });
    });

    it('should create a counter metric', async () => {
      const counter = metricsContext.createCounter({
        name: 'test_counter_total',
        help: 'Test counter',
      });

      counter.inc();
      counter.inc();
      counter.inc(5);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('test_counter_total 7');
    });

    it('should create a counter with labels', async () => {
      const counter = metricsContext.createCounter({
        name: 'requests_total',
        help: 'Total requests',
        labelNames: ['method', 'status'] as const,
      });

      counter.inc({ method: 'GET', status: '200' }, 3);
      counter.inc({ method: 'GET', status: '200' }, 2);
      counter.inc({ method: 'POST', status: '201' });

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('requests_total{method="GET",status="200"} 5');
      expect(metrics).toContain('requests_total{method="POST",status="201"} 1');
    });

    it('should validate metric names', () => {
      expect(() => {
        metricsContext.createCounter({
          name: '',
          help: 'Empty name',
        });
      }).toThrow('Metric name cannot be empty');

      expect(() => {
        metricsContext.createCounter({
          name: '123invalid',
          help: 'Invalid name',
        });
      }).toThrow('Invalid metric name');
    });

    it('should validate label names', () => {
      expect(() => {
        metricsContext.createCounter({
          name: 'test_counter',
          help: 'Test counter',
          labelNames: ['__reserved'],
        });
      }).toThrow('reserved');

      expect(() => {
        metricsContext.createCounter({
          name: 'test_counter_2',
          help: 'Test counter',
          labelNames: ['123invalid'],
        });
      }).toThrow('Invalid label name');
    });
  });

  describe('gauge metrics', () => {
    let metricsContext: ReturnType<typeof createMetricsContext>;

    beforeEach(() => {
      metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
      });
    });

    it('should create a gauge metric', async () => {
      const gauge = metricsContext.createGauge({
        name: 'memory_usage_bytes',
        help: 'Memory usage',
      });

      gauge.set(1024);
      let metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('memory_usage_bytes 1024');

      gauge.inc(256);
      metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('memory_usage_bytes 1280');

      gauge.dec(80);
      metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('memory_usage_bytes 1200');
    });

    it('should create a gauge with labels', async () => {
      const gauge = metricsContext.createGauge({
        name: 'queue_size',
        help: 'Queue size',
        labelNames: ['queue_name'] as const,
      });

      gauge.set({ queue_name: 'orders' }, 42);
      gauge.inc({ queue_name: 'orders' }, 5);
      gauge.dec({ queue_name: 'orders' }, 3);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('queue_size{queue_name="orders"} 44');
    });
  });

  describe('histogram metrics', () => {
    let metricsContext: ReturnType<typeof createMetricsContext>;

    beforeEach(() => {
      metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
      });
    });

    it('should create a histogram with default buckets', async () => {
      const histogram = metricsContext.createHistogram({
        name: 'request_duration_seconds',
        help: 'Request duration',
      });

      histogram.observe(0.025);
      histogram.observe(0.15);
      histogram.observe(0.8);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('request_duration_seconds_count 3');
      expect(metrics).toContain('request_duration_seconds_sum');
      expect(metrics).toContain('request_duration_seconds_bucket');
    });

    it('should create a histogram with custom buckets', async () => {
      const histogram = metricsContext.createHistogram({
        name: 'response_size_bytes',
        help: 'Response size',
        buckets: [100, 500, 1000, 5000, 10000],
      });

      histogram.observe(750);
      histogram.observe(1500);
      histogram.observe(250);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('response_size_bytes_count 3');
      expect(metrics).toContain('response_size_bytes_bucket{le="500"} 1');
      expect(metrics).toContain('response_size_bytes_bucket{le="1000"} 2');
      expect(metrics).toContain('response_size_bytes_bucket{le="5000"} 3');
    });

    it('should support histogram timer pattern', async () => {
      const histogram = metricsContext.createHistogram({
        name: 'processing_duration_seconds',
        help: 'Processing duration',
      });

      const endTimer = histogram.startTimer();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const duration = endTimer();

      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0.01);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('processing_duration_seconds_count 1');
    });

    it('should create a histogram with labels', async () => {
      const histogram = metricsContext.createHistogram({
        name: 'http_request_duration_seconds',
        help: 'HTTP request duration',
        labelNames: ['method', 'path'] as const,
      });

      histogram.observe({ method: 'GET', path: '/api/users' }, 0.123);
      histogram.observe({ method: 'GET', path: '/api/users' }, 0.087);
      histogram.observe({ method: 'POST', path: '/api/orders' }, 0.256);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('http_request_duration_seconds_count{method="GET",path="/api/users"} 2');
      expect(metrics).toContain('http_request_duration_seconds_count{method="POST",path="/api/orders"} 1');
    });
  });

  describe('summary metrics', () => {
    let metricsContext: ReturnType<typeof createMetricsContext>;

    beforeEach(() => {
      metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
      });
    });

    it('should create a summary with default percentiles', async () => {
      const summary = metricsContext.createSummary({
        name: 'request_latency_seconds',
        help: 'Request latency',
      });

      summary.observe(0.1);
      summary.observe(0.2);
      summary.observe(0.3);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('request_latency_seconds_count 3');
      expect(metrics).toContain('request_latency_seconds_sum');
      expect(metrics).toContain('request_latency_seconds{quantile="0.5"}');
      expect(metrics).toContain('request_latency_seconds{quantile="0.95"}');
      expect(metrics).toContain('request_latency_seconds{quantile="0.99"}');
    });

    it('should create a summary with custom percentiles', async () => {
      const summary = metricsContext.createSummary({
        name: 'processing_time_seconds',
        help: 'Processing time',
        percentiles: [0.5, 0.9, 0.95, 0.99],
      });

      summary.observe(0.15);
      summary.observe(0.23);
      summary.observe(0.31);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('processing_time_seconds_count 3');
      expect(metrics).toContain('processing_time_seconds{quantile="0.5"}');
      expect(metrics).toContain('processing_time_seconds{quantile="0.9"}');
      expect(metrics).toContain('processing_time_seconds{quantile="0.95"}');
      expect(metrics).toContain('processing_time_seconds{quantile="0.99"}');
    });

    it('should create a summary with custom configuration', async () => {
      const summary = metricsContext.createSummary({
        name: 'message_size_bytes',
        help: 'Message size',
        percentiles: [0.5, 0.95, 0.99],
        maxAgeSeconds: 300,
        ageBuckets: 3,
      });

      summary.observe(128);
      summary.observe(256);
      summary.observe(512);
      summary.observe(1024);

      const metrics = await metricsContext.getMetricsAsString();
      expect(metrics).toContain('message_size_bytes_count 4');
      expect(metrics).toContain('message_size_bytes_sum');
    });
  });

  describe('metrics serialization', () => {
    let metricsContext: ReturnType<typeof createMetricsContext>;

    beforeEach(() => {
      metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
      });
    });

    it('should export metrics as Prometheus text format', async () => {
      const counter = metricsContext.createCounter({
        name: 'test_requests_total',
        help: 'Test requests',
      });

      counter.inc();
      counter.inc();

      const metricsOutput = await metricsContext.getMetricsAsString();

      expect(metricsOutput).toContain('# HELP test_service_test_requests_total Test requests');
      expect(metricsOutput).toContain('# TYPE test_service_test_requests_total counter');
      expect(metricsOutput).toContain('test_service_test_requests_total 2');
    });

    it('should export metrics with labels', async () => {
      const counter = metricsContext.createCounter({
        name: 'http_requests_total',
        help: 'HTTP requests',
        labelNames: ['method', 'status'] as const,
      });

      counter.inc({ method: 'GET', status: '200' });
      counter.inc({ method: 'POST', status: '201' });

      const metricsOutput = await metricsContext.getMetricsAsString();

      expect(metricsOutput).toContain('http_requests_total{method="GET",status="200"} 1');
      expect(metricsOutput).toContain('http_requests_total{method="POST",status="201"} 1');
    });

    it('should get metrics as array', () => {
      metricsContext.createCounter({
        name: 'counter_metric',
        help: 'Counter',
      });

      metricsContext.createGauge({
        name: 'gauge_metric',
        help: 'Gauge',
      });

      const metrics = metricsContext.getMetrics();

      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('default metrics', () => {
    it('should collect default metrics when enabled', async () => {
      const metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
        enableDefaultMetrics: true,
      });

      const metricsOutput = await metricsContext.getMetricsAsString();

      expect(metricsOutput).toContain('test_service_process_');
      expect(metricsOutput).toContain('test_service_nodejs_');
    });

    it('should not collect default metrics when disabled', async () => {
      const metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
        enableDefaultMetrics: false,
      });

      const metricsOutput = await metricsContext.getMetricsAsString();

      expect(metricsOutput.trim()).toBe('');
    });

    it('should apply prefix to default metrics', async () => {
      const metricsContext = createMetricsContext({
        envContext: createMockEnvContext('my-app'),
        enableDefaultMetrics: true,
        prefix: 'custom_',
      });

      const metricsOutput = await metricsContext.getMetricsAsString();

      expect(metricsOutput).toContain('my_app_custom_process_');
      expect(metricsOutput).toContain('my_app_custom_nodejs_');
    });
  });

  describe('metric naming conventions', () => {
    let metricsContext: ReturnType<typeof createMetricsContext>;

    beforeEach(() => {
      metricsContext = createMetricsContext({
        envContext: createMockEnvContext(),
      });
    });

    it('should accept valid metric names', () => {
      expect(() => {
        metricsContext.createCounter({ name: 'valid_metric_name', help: 'Test' });
      }).not.toThrow();

      expect(() => {
        metricsContext.createCounter({ name: 'metric_with_unit_seconds', help: 'Test' });
      }).not.toThrow();

      expect(() => {
        metricsContext.createCounter({ name: 'subsystem:metric_name', help: 'Test' });
      }).not.toThrow();

      expect(() => {
        metricsContext.createCounter({ name: '_leading_underscore', help: 'Test' });
      }).not.toThrow();
    });

    it('should accept valid label names', () => {
      expect(() => {
        metricsContext.createCounter({
          name: 'test_metric',
          help: 'Test',
          labelNames: ['valid_label'],
        });
      }).not.toThrow();

      expect(() => {
        metricsContext.createCounter({
          name: 'test_metric_2',
          help: 'Test',
          labelNames: ['label_with_numbers123'],
        });
      }).not.toThrow();

      expect(() => {
        metricsContext.createCounter({
          name: 'test_metric_3',
          help: 'Test',
          labelNames: ['_leading_underscore'],
        });
      }).not.toThrow();
    });
  });
});

