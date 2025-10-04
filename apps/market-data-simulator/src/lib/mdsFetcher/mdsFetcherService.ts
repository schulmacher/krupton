import type { MdsFetcherContext } from '../../process/mdsFetcherProcess/context.js';
import type { FetcherState, MdsFetcherService } from './types.js';

export const createFetcherService = (context: MdsFetcherContext): MdsFetcherService => {
  const { envContext, diagnosticContext, metricsContext, processContext } = context;
  const logger = diagnosticContext.createRootLogger();
  const config = envContext.config;

  const state: FetcherState = {
    isRunning: false,
    fetchCount: 0,
    lastFetchTime: null,
    errors: 0,
  };

  const parseSymbolsFromEnvironment = () => {
    return config.SYMBOLS.split(',').map((s) => s.trim());
  };

  const {
    fetchCounter,
    fetchDuration,
    activeSymbolsGauge,
    serviceRunningGauge,
    totalFetchesGauge,
    lastFetchTimestampGauge,
    totalErrorsGauge,
  } = metricsContext.metrics;

  const symbols = parseSymbolsFromEnvironment();

  activeSymbolsGauge.set(symbols.length);
  serviceRunningGauge.set(0);
  totalFetchesGauge.set(0);
  lastFetchTimestampGauge.set(0);
  totalErrorsGauge.set(0);

  logger.info('Fetcher service initialized', {
    platform: config.PLATFORM,
    symbols,
    fetchInterval: config.FETCH_INTERVAL_MS,
    storageDir: config.STORAGE_BASE_DIR,
  });

  const executeFetch = async (symbol: string, endpoint: string): Promise<void> => {
    const startTime = Date.now();

    try {
      logger.debug('Executing fetch', {
        platform: config.PLATFORM,
        symbol,
        endpoint,
      });

      const simulateApiCall = () => new Promise((resolve) => setTimeout(resolve, 100));
      await simulateApiCall();

      const duration = (Date.now() - startTime) / 1000;

      fetchCounter.inc({
        platform: config.PLATFORM,
        endpoint,
        status: 'success',
      });

      fetchDuration.observe(
        {
          platform: config.PLATFORM,
          endpoint,
        },
        duration,
      );

      state.fetchCount++;
      state.lastFetchTime = Date.now();

      totalFetchesGauge.set(state.fetchCount);
      lastFetchTimestampGauge.set(state.lastFetchTime / 1000);

      logger.debug('Fetch completed', {
        platform: config.PLATFORM,
        symbol,
        endpoint,
        duration,
      });
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;

      fetchCounter.inc({
        platform: config.PLATFORM,
        endpoint,
        status: 'error',
      });

      fetchDuration.observe(
        {
          platform: config.PLATFORM,
          endpoint,
        },
        duration,
      );

      state.errors++;
      totalErrorsGauge.set(state.errors);

      logger.error('Fetch failed', {
        platform: config.PLATFORM,
        symbol,
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const fetchLoop = async (): Promise<void> => {
    logger.info('Starting fetch loop', {
      interval: config.FETCH_INTERVAL_MS,
      symbols: symbols.length,
    });

    while (state.isRunning && !processContext.isShuttingDown()) {
      const loopStartTime = Date.now();

      const fetchAllSymbolsInParallel = () =>
        Promise.all(
          symbols.map((symbol) =>
            Promise.all([
              executeFetch(symbol, '/trades'),
              executeFetch(symbol, '/depth'),
              executeFetch(symbol, '/bookTicker'),
            ]),
          ),
        );

      await fetchAllSymbolsInParallel();

      const calculateSleepTimeToMaintainInterval = (elapsedMs: number) =>
        Math.max(0, config.FETCH_INTERVAL_MS - elapsedMs);

      const elapsed = Date.now() - loopStartTime;
      const sleepTime = calculateSleepTimeToMaintainInterval(elapsed);

      if (sleepTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
      }
    }

    logger.info('Fetch loop stopped');
  };

  const start = async (): Promise<void> => {
    if (state.isRunning) {
      logger.warn('Fetcher service already running');
      return;
    }

    logger.info('Starting fetcher service');

    state.isRunning = true;
    serviceRunningGauge.set(1);

    void fetchLoop();
  };

  const stop = async (): Promise<void> => {
    if (!state.isRunning) {
      return;
    }

    logger.info('Stopping fetcher service');
    state.isRunning = false;
    serviceRunningGauge.set(0);

    const IN_FLIGHT_REQUESTS_TIMEOUT_MS = 1000;
    const waitForInFlightRequestsToComplete = () =>
      new Promise((resolve) => setTimeout(resolve, IN_FLIGHT_REQUESTS_TIMEOUT_MS));

    await waitForInFlightRequestsToComplete();

    logger.info('Fetcher service stopped', {
      totalFetches: state.fetchCount,
      errors: state.errors,
    });
  };

  return {
    start,
    stop,
  };
};

