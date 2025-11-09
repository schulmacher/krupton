import type { MetricConfigCounter } from '../../metrics/types.js';

const throughput: MetricConfigCounter<'platform' | 'type' | 'symbol'> = {
  type: 'counter',
  name: 'transformation_throughput',
  help: 'Count of transformed data',
  labelNames: ['platform', 'type', 'symbol'] as const,
};

export const internalBridgeTransformerMetrics = {
  throughput,
};
