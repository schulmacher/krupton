import {
  ApiClientError,
  type EndpointDefinition,
  type ExtractEndpointDefinitionResponseSchema,
  type ExtractEndpointParams,
} from '@krupton/api-client-node';
import { tryHard } from '@krupton/utils';
import type { BinanceFetcherContext } from '../../process/fetcherProcess/binanceFetcherContext.js';
import type { KrakenFetcherContext } from '../../process/fetcherProcess/krakenFetcherContext.js';
import type {
  ExternalBridgeFetcherLoop,
  ExternalBridgeFetcherLoopState,
  FetcherConfig,
} from './types.js';

export const createExternalBridgeFetcherLoop = <E extends EndpointDefinition>(
  context: BinanceFetcherContext | KrakenFetcherContext,
  config: FetcherConfig<E>,
): ExternalBridgeFetcherLoop => {
  const { envContext, diagnosticContext, metricsContext, processContext, rateLimiter } = context;
  const env = envContext.config;
  const { onSuccess, buildRequestParams, endpointFn, symbol } = config;

  const state: ExternalBridgeFetcherLoopState = {
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

  diagnosticContext.logger.info('Fetcher loop initialized', {
    platform: env.PLATFORM,
    symbol: symbol,
    endpointPath: endpointFn.definition.path,
    fetchInterval: env.FETCH_INTERVAL_MS,
    storageDir: env.STORAGE_BASE_DIR,
  });

  const executeFetch = async (): Promise<void> => {
    const endpointPath = endpointFn.definition.path;
    let startTime = Date.now();

    prevParams = await buildRequestParams({ prevResponse, prevParams });

    diagnosticContext.logger.debug('Executing fetch', {
      symbol: symbol,
      endpoint: endpointPath,
      params: prevParams,
    });

    const response = await tryHard(
      async () => {
        startTime = Date.now();

        await context.rateLimiter.throttle();
        diagnosticContext.logger.debug('Throttled for', {
          ms: Date.now() - startTime,
          symbol: symbol,
          endpoint: endpointPath,
        });
        
        const result = await endpointFn(prevParams!);

        context.rateLimiter.recordRequest();

        const duration = (Date.now() - startTime) / 1000;
    
        state.fetchCount++;
        state.lastFetchTime = Date.now();
    
        try {
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
    
          totalFetchesGauge.set(state.fetchCount);
          lastFetchTimestampGauge.set(state.lastFetchTime / 1000);
        } catch (error) {
          diagnosticContext.logger.error(error, 'Fetch monitoring failed', {
            platform: env.PLATFORM,
            symbol: symbol,
            endpoint: endpointPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
    
        diagnosticContext.logger.debug('Fetch completed', {
          symbol: symbol,
          endpoint: endpointPath,
          duration,
        });

        return result;
      },
      (error) => {
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

        diagnosticContext.logger.error(error, 'Fetch failed', {
          platform: env.PLATFORM,
          symbol: symbol,
          endpoint: endpointPath,
          error:
            error instanceof ApiClientError
              ? error.toErrorPlainObject()
              : error instanceof Error
                ? error.message
                : String(error),
        });

        return 100;
      },
    );
   

    if (onSuccess) {
      await onSuccess({
        ...prevParams,
        response,
        prevResponse,
      });
    }

    prevResponse = response;
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
