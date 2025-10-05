import type { Counter, Gauge, Histogram, Summary, Registry } from 'prom-client';
import type { DefaultEnvContext } from '../environment/types.js';

export interface MetricConfigCounter<T extends string = string> {
  type: 'counter';
  name: string;
  help: string;
  labelNames?: readonly T[];
}

export interface MetricConfigGauge<T extends string = string> {
  type: 'gauge';
  name: string;
  help: string;
  labelNames?: readonly T[];
}

export interface MetricConfigHistogram<T extends string = string> {
  type: 'histogram';
  name: string;
  help: string;
  labelNames?: readonly T[];
  buckets?: number[];
}

export interface MetricConfigSummary<T extends string = string> {
  type: 'summary';
  name: string;
  help: string;
  labelNames?: readonly T[];
  percentiles?: number[];
  maxAgeSeconds?: number;
  ageBuckets?: number;
}

export type MetricConfig<T extends string = string> =
  | MetricConfigCounter<T>
  | MetricConfigGauge<T>
  | MetricConfigHistogram<T>
  | MetricConfigSummary<T>;

export type MetricFromConfig<T> = T extends MetricConfigCounter<infer L>
  ? Counter<L>
  : T extends MetricConfigGauge<infer L>
    ? Gauge<L>
    : T extends MetricConfigHistogram<infer L>
      ? Histogram<L>
      : T extends MetricConfigSummary<infer L>
        ? Summary<L>
        : never;

export type MetricsFromConfigs<T extends Record<string, MetricConfig>> = {
  [K in keyof T]: MetricFromConfig<T[K]>;
};

export interface MetricsConfig<TMetricsConfigs extends Record<string, MetricConfig> = Record<string, MetricConfig>> {
  envContext: DefaultEnvContext;
  enableDefaultMetrics?: boolean;
  defaultMetricsInterval?: number;
  prefix?: string;
  metrics?: TMetricsConfigs;
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
