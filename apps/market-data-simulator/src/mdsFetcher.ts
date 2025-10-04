#!/usr/bin/env node

/**
 * Market Data Simulator - Data Fetcher Service
 *
 * This service fetches market data from cryptocurrency exchange REST APIs
 * and persists responses to structured storage for later replay.
 *
 * Environment Variables:
 * - PLATFORM: Exchange platform (binance, kraken)
 * - SYMBOLS: Comma-separated trading pairs (e.g., BTCUSDT,ETHUSDT)
 * - FETCH_INTERVAL_MS: Interval between fetches in milliseconds
 * - FETCH_MODE: Operational mode (recording, backfill, snapshot)
 * - PORT: HTTP server port for health checks and metrics
 *
 * Endpoints:
 * - GET /health - Health check endpoint
 * - GET /metrics - Prometheus metrics
 * - GET /status - Fetcher status and statistics
 */

import { createMdsFetcherContext } from './process/mdsFetcher/context.js';
import { startMdsFetcherService } from './process/mdsFetcher/mdsFetcher.js';

const bootstrap = async (): Promise<void> => {
  try {
    const context = createMdsFetcherContext();

    const logger = context.diagnosticContext.createRootLogger();

    logger.info('Bootstrapping mdsFetcher service', {
      processName: context.envContext.config.PROCESS_NAME,
      nodeEnv: context.envContext.nodeEnv,
      platform: context.envContext.config.PLATFORM,
    });

    await startMdsFetcherService(context);
  } catch (error) {
    console.error('Failed to bootstrap mdsFetcher service:', error);
    process.exit(1);
  }
};

void bootstrap();
