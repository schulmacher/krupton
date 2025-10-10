/**
 * Port allocations for all services in the dev environment
 */

module.exports = {
  // External Bridge Services
  EXTERNAL_BRIDGE_FETCHER_BINANCE: 3000,
  EXTERNAL_BRIDGE_FETCHER_KRAKEN: 3001,
  EXTERNAL_BRIDGE_WEBSOCKET_BINANCE: 3100,
  EXTERNAL_BRIDGE_WEBSOCKET_KRAKEN: 3101,

  EXTERNAL_BRIDGE_STORAGE: 3200,

  // Monitoring Services
  PERSES: 8080,
  VICTORIA_METRICS: 8428,
};

