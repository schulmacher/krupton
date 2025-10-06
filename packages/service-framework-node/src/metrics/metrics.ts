import { Counter, Gauge, Histogram, Registry, Summary, collectDefaultMetrics } from 'prom-client';
import type {
  DefaultMetricsCollection,
  MetricConfig,
  MetricConfigCounter,
  MetricConfigGauge,
  MetricConfigHistogram,
  MetricConfigSummary,
  MetricsConfig,
  MetricsContext,
  MetricsFromConfigs,
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
): DefaultMetricsCollection {
  let isCollecting = false;

  return {
    startCollection(): void {
      if (isCollecting) {
        return;
      }

      collectDefaultMetrics({
        register: registry,
      });

      isCollecting = true;
    },

    stopCollection(): void {
      isCollecting = false;
    },
  };
}

export function createMetricsContext<TMetricsConfigs extends Record<string, MetricConfig>>(
  config: MetricsConfig<TMetricsConfigs>,
): MetricsContext<MetricsFromConfigs<TMetricsConfigs>>;
export function createMetricsContext(
  config: MetricsConfig<Record<string, MetricConfig>>,
): MetricsContext<undefined>;
export function createMetricsContext<
  TMetricsConfigs extends Record<string, MetricConfig> | undefined,
>(
  config: MetricsConfig<TMetricsConfigs & Record<string, MetricConfig>>,
): MetricsContext<
  TMetricsConfigs extends Record<string, MetricConfig>
    ? MetricsFromConfigs<TMetricsConfigs>
    : undefined
> {
  const registry = new Registry();

  const normalizedServiceName = normalizeServiceName(config.envContext.config.PROCESS_NAME);
  const fullPrefix = config.prefix
    ? `${normalizedServiceName}_${config.prefix}`
    : `${normalizedServiceName}_`;

  const defaultMetricsCollection = config.enableDefaultMetrics
    ? createDefaultMetricsCollection(registry)
    : undefined;

  if (defaultMetricsCollection) {
    defaultMetricsCollection.startCollection();
  }

  function createMetricFromConfig<T extends string>(
    metricConfig: MetricConfig<T>,
  ): Counter<T> | Gauge<T> | Histogram<T> | Summary<T> {
    switch (metricConfig.type) {
      case 'counter':
        return createCounter(metricConfig);
      case 'gauge':
        return createGauge(metricConfig);
      case 'histogram':
        return createHistogram(metricConfig);
      case 'summary':
        return createSummary(metricConfig);
      default:
        throw new Error(`Unknown metric type: ${(metricConfig as MetricConfig).type}`);
    }
  }

  function createCounter<T extends string>(config: MetricConfigCounter<T>): Counter<T> {
    validateMetricName(config.name);
    validateLabelNames(config.labelNames);

    const counter = new Counter<T>({
      name: `${fullPrefix}${config.name}`,
      help: config.help,
      labelNames: config.labelNames ? (config.labelNames as T[]) : [],
      registers: [registry],
    });

    return counter;
  }

  function createGauge<T extends string>(config: MetricConfigGauge<T>): Gauge<T> {
    validateMetricName(config.name);
    validateLabelNames(config.labelNames);

    const gauge = new Gauge<T>({
      name: `${fullPrefix}${config.name}`,
      help: config.help,
      labelNames: config.labelNames ? (config.labelNames as T[]) : [],
      registers: [registry],
    });

    return gauge;
  }

  function createHistogram<T extends string>(config: MetricConfigHistogram<T>): Histogram<T> {
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
  }

  function createSummary<T extends string>(config: MetricConfigSummary<T>): Summary<T> {
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
  }

  const instantiatedMetrics = config.metrics
    ? (Object.entries(config.metrics).reduce(
        (acc, [key, metricConfig]) => {
          acc[key] = createMetricFromConfig(metricConfig);
          return acc;
        },
        {} as Record<string, Counter<string> | Gauge<string> | Histogram<string> | Summary<string>>,
      ) as MetricsFromConfigs<TMetricsConfigs & Record<string, MetricConfig>>)
    : undefined;

  return {
    getRegistry(): Registry {
      return registry;
    },

    createCounter,
    createGauge,
    createHistogram,
    createSummary,

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

    metrics: instantiatedMetrics,
  } as unknown as MetricsContext<
    TMetricsConfigs extends Record<string, MetricConfig>
      ? MetricsFromConfigs<TMetricsConfigs>
      : undefined
  >;
}
