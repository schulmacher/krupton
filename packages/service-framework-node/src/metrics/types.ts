import type { Counter, Gauge, Histogram, Summary, Registry } from 'prom-client';
import type { DefaultEnvContext } from '../environment/types.js';

export interface MetricConfigCounter<T extends string = string> {
  name: string;
  help: string;
  labelNames?: readonly T[];
}

export interface MetricConfigGauge<T extends string = string> {
  name: string;
  help: string;
  labelNames?: readonly T[];
}

export interface MetricConfigHistogram<T extends string = string> {
  name: string;
  help: string;
  labelNames?: readonly T[];
  buckets?: number[];
}

export interface MetricConfigSummary<T extends string = string> {
  name: string;
  help: string;
  labelNames?: readonly T[];
  percentiles?: number[];
  maxAgeSeconds?: number;
  ageBuckets?: number;
}

export interface MetricsConfig<TMetrics = undefined> {
  envContext: DefaultEnvContext;
  enableDefaultMetrics?: boolean;
  defaultMetricsInterval?: number;
  prefix?: string;
  metrics?: TMetrics;
}

export interface MetricsContext<TMetrics = undefined> {
  getRegistry: () => Registry;
  createCounter: <T extends string>(config: MetricConfigCounter<T>) => Counter<T>;
  createGauge: <T extends string>(config: MetricConfigGauge<T>) => Gauge<T>;
  createHistogram: <T extends string>(config: MetricConfigHistogram<T>) => Histogram<T>;
  createSummary: <T extends string>(config: MetricConfigSummary<T>) => Summary<T>;
  getMetricsAsString: () => Promise<string>;
  getMetrics: () => ReturnType<Registry['getMetricsAsArray']>;
  clearMetrics: () => void;
  metrics: TMetrics;
}

export interface DefaultMetricsCollection {
  startCollection: () => void;
  stopCollection: () => void;
}

export type RegisteredMetrics<Ctx extends { metricsContext: MetricsContext<unknown> }> =
  Ctx['metricsContext']['metrics'];
