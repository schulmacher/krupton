import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  Summary,
  collectDefaultMetrics,
} from 'prom-client';
import type {
  MetricConfigCounter,
  MetricConfigGauge,
  MetricConfigHistogram,
  MetricConfigSummary,
  MetricsConfig,
  MetricsContext,
  DefaultMetricsCollection,
} from './types.js';

const defaultHistogramBuckets = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10];
const defaultSummaryPercentiles = [0.5, 0.95, 0.99];

const defaultSummaryMaxAgeSeconds = 600;

const defaultSummaryAgeBuckets = 5;

const normalizeServiceName = (serviceName: string): string => {
  return serviceName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

function validateMetricName(name: string): void {
  if (!name) {
    throw new Error('Metric name cannot be empty');
  }

  const validNamePattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
  if (!validNamePattern.test(name)) {
    throw new Error(
      `Invalid metric name '${name}'. Metric names must match pattern: [a-zA-Z_:][a-zA-Z0-9_:]*`,
    );
  }
}

function validateLabelNames(labelNames: readonly string[] | undefined): void {
  if (!labelNames) {
    return;
  }

  const validLabelPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  for (const label of labelNames) {
    if (!validLabelPattern.test(label)) {
      throw new Error(
        `Invalid label name '${label}'. Label names must match pattern: [a-zA-Z_][a-zA-Z0-9_]*`,
      );
    }

    if (label.startsWith('__')) {
      throw new Error(`Label name '${label}' is reserved. Label names cannot start with '__'`);
    }
  }
}

export function createDefaultMetricsCollection(
  registry: Registry,
  config: MetricsConfig<unknown>,
  fullPrefix: string,
): DefaultMetricsCollection {
  let isCollecting = false;

  return {
    startCollection(): void {
      if (isCollecting) {
        return;
      }

      collectDefaultMetrics({
        register: registry,
        prefix: fullPrefix,
      });

      isCollecting = true;
    },

    stopCollection(): void {
      isCollecting = false;
    },
  };
}

export function createMetricsContext<TMetrics = undefined>(
  config: MetricsConfig<TMetrics>,
): MetricsContext<TMetrics> {
  const registry = new Registry();

  const normalizedServiceName = normalizeServiceName(config.envContext.config.PROCESS_NAME);
  const fullPrefix = config.prefix
    ? `${normalizedServiceName}_${config.prefix}`
    : `${normalizedServiceName}_`;

  const defaultMetricsCollection = config.enableDefaultMetrics
    ? createDefaultMetricsCollection(registry, config, fullPrefix)
    : undefined;

  if (defaultMetricsCollection) {
    defaultMetricsCollection.startCollection();
  }

  return {
    getRegistry(): Registry {
      return registry;
    },

    createCounter<T extends string>(config: MetricConfigCounter<T>): Counter<T> {
      validateMetricName(config.name);
      validateLabelNames(config.labelNames);

      const counter = new Counter<T>({
        name: `${fullPrefix}${config.name}`,
        help: config.help,
        labelNames: config.labelNames ? (config.labelNames as T[]) : [],
        registers: [registry],
      });

      return counter;
    },

    createGauge<T extends string>(config: MetricConfigGauge<T>): Gauge<T> {
      validateMetricName(config.name);
      validateLabelNames(config.labelNames);

      const gauge = new Gauge<T>({
        name: `${fullPrefix}${config.name}`,
        help: config.help,
        labelNames: config.labelNames ? (config.labelNames as T[]) : [],
        registers: [registry],
      });

      return gauge;
    },

    createHistogram<T extends string>(config: MetricConfigHistogram<T>): Histogram<T> {
      validateMetricName(config.name);
      validateLabelNames(config.labelNames);

      const buckets = config.buckets ?? defaultHistogramBuckets;

      const histogram = new Histogram<T>({
        name: `${fullPrefix}${config.name}`,
        help: config.help,
        labelNames: config.labelNames ? (config.labelNames as T[]) : [],
        buckets,
        registers: [registry],
      });

      return histogram;
    },

    createSummary<T extends string>(config: MetricConfigSummary<T>): Summary<T> {
      validateMetricName(config.name);
      validateLabelNames(config.labelNames);

      const percentiles = config.percentiles ?? defaultSummaryPercentiles;
      const maxAgeSeconds = config.maxAgeSeconds ?? defaultSummaryMaxAgeSeconds;
      const ageBuckets = config.ageBuckets ?? defaultSummaryAgeBuckets;

      const summary = new Summary<T>({
        name: `${fullPrefix}${config.name}`,
        help: config.help,
        labelNames: config.labelNames ? (config.labelNames as T[]) : [],
        percentiles,
        maxAgeSeconds,
        ageBuckets,
        registers: [registry],
      });

      return summary;
    },

    async getMetricsAsString(): Promise<string> {
      return await registry.metrics();
    },

    getMetrics() {
      return registry.getMetricsAsArray();
    },

    clearMetrics(): void {
      if (defaultMetricsCollection) {
        defaultMetricsCollection.stopCollection();
      }
      registry.clear();
    },

    metrics: config.metrics as TMetrics,
  };
}

