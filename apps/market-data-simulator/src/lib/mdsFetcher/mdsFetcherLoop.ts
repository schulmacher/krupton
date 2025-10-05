import type {
  EndpointDefinition,
  ExtractEndpointDefinitionResponseSchema,
  ExtractEndpointParams
} from '@krupton/api-client-node';
import type { MdsFetcherContext } from '../../process/mdsFetcherProcess/context.js';
import type {
  FetcherConfig,
  MdsFetcherLoop,
  MdsFetcherLoopState
} from './types.js';

export const createMdsFetcherLoop = <E extends EndpointDefinition>(
  context: MdsFetcherContext,
  config: FetcherConfig<E>,
): MdsFetcherLoop => {
  const { envContext, diagnosticContext, metricsContext, processContext, rateLimiter } = context;
  const env = envContext.config;
  const { onSuccess, buildRequestParams, endpointFn, symbol } = config;

  const state: MdsFetcherLoopState = {
    isRunning: false,
    fetchCount: 0,
    lastFetchTime: null,
    errors: 0,
  };

  let prevResponse: ExtractEndpointDefinitionResponseSchema<E> | null = null;
  let prevParams: ExtractEndpointParams<E> | null = null;

  const {
    fetchCounter,
    fetchDuration,
    totalFetchesGauge,
    lastFetchTimestampGauge,
    totalErrorsGauge,
  } = metricsContext.metrics;

  totalFetchesGauge.set(0);
  lastFetchTimestampGauge.set(0);
  totalErrorsGauge.set(0);

  diagnosticContext.logger.info('Fetcher loop initialized', {
    platform: env.PLATFORM,
    symbol: symbol,
    endpointPath: endpointFn.definition.path,
    fetchInterval: env.FETCH_INTERVAL_MS,
    storageDir: env.STORAGE_BASE_DIR,
  });

  const executeFetch = async (): Promise<void> => {
    const startTime = Date.now();
    const endpointPath = endpointFn.definition.path;

    try {
      await context.rateLimiter.throttle();
      prevParams = buildRequestParams({ prevResponse, prevParams });

      diagnosticContext.logger.debug('Executing fetch', {
        platform: env.PLATFORM,
        symbol: symbol,
        endpoint: endpointPath,
        params: prevParams,
      });

      const response = await endpointFn(prevParams);

      context.rateLimiter.recordRequest();

      if (onSuccess) {
        await onSuccess({
          ...prevParams,
          response,
        });
      }

      prevResponse = response;

      const duration = (Date.now() - startTime) / 1000;

      fetchCounter.inc({
        platform: env.PLATFORM,
        endpoint: endpointPath,
        status: 'success',
      });

      fetchDuration.observe(
        {
          platform: env.PLATFORM,
          endpoint: endpointPath,
        },
        duration,
      );

      state.fetchCount++;
      state.lastFetchTime = Date.now();

      totalFetchesGauge.set(state.fetchCount);
      lastFetchTimestampGauge.set(state.lastFetchTime / 1000);

      diagnosticContext.logger.debug('Fetch completed', {
        platform: env.PLATFORM,
        symbol: symbol,
        endpoint: endpointPath,
        duration,
      });
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;

      rateLimiter.onError();

      fetchCounter.inc({
        platform: env.PLATFORM,
        endpoint: endpointPath,
        status: 'error',
      });

      fetchDuration.observe(
        {
          platform: env.PLATFORM,
          endpoint: endpointPath,
        },
        duration,
      );

      state.errors++;
      totalErrorsGauge.set(state.errors);

      diagnosticContext.logger.error('Fetch failed', {
        platform: env.PLATFORM,
        symbol: symbol,
        endpoint: endpointPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const fetchLoop = async (): Promise<void> => {
    diagnosticContext.logger.info('Starting fetch loop', {
      interval: env.FETCH_INTERVAL_MS,
      symbol: symbol,
    });

    while (state.isRunning && !processContext.isShuttingDown()) {
      const loopStartTime = Date.now();

      await executeFetch();

      if (env.FETCH_INTERVAL_MS > 0) {
        const calculateSleepTimeToMaintainInterval = (elapsedMs: number) =>
          Math.max(0, env.FETCH_INTERVAL_MS - elapsedMs);

        const elapsed = Date.now() - loopStartTime;
        const sleepTime = calculateSleepTimeToMaintainInterval(elapsed);

        if (sleepTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, sleepTime));
        }
      }
    }

    diagnosticContext.logger.info('Fetch loop stopped');
  };

  const start = async (): Promise<void> => {
    if (state.isRunning) {
      diagnosticContext.logger.warn('Fetcher loop already running');
      return;
    }

    diagnosticContext.logger.info('Starting fetcher service');

    state.isRunning = true;

    void fetchLoop();
  };

  const stop = async (): Promise<void> => {
    if (!state.isRunning) {
      return;
    }

    diagnosticContext.logger.info('Stopping fetcher service');
    state.isRunning = false;

    const IN_FLIGHT_REQUESTS_TIMEOUT_MS = 2_000;
    const waitForInFlightRequestsToComplete = () =>
      new Promise((resolve) => setTimeout(resolve, IN_FLIGHT_REQUESTS_TIMEOUT_MS));

    await waitForInFlightRequestsToComplete();

    diagnosticContext.logger.info('Fetcher loop stopped', {
      totalFetches: state.fetchCount,
      errors: state.errors,
    });
  };

  return {
    start,
    stop,
  };
};
