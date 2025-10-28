import { SF } from '@krupton/service-framework-node';

export function createTransformerMetricsContext<T extends SF.DefaultEnvContext>(envContext: T) {
  const metricsContext = SF.createMetricsContext({
    envContext,
    prefix: 'internal_bridge_transformer',
    enableDefaultMetrics: true,
    metrics: {
      throughput: SF.internalBridgeTransformerMetrics.throughput,
    },
  });

  return metricsContext;
}
