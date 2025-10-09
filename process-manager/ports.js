/**
 * Port allocations for all services in the dev environment
 */

module.exports = {
  // External Bridge Services
  EXTERNAL_BRIDGE_FETCHER: 3000,
  EXTERNAL_BRIDGE_STORAGE: 3001,
  EXTERNAL_BRIDGE_WEBSOCKET_BINANCE: 3002,
  EXTERNAL_BRIDGE_WEBSOCKET_KRAKEN: 3003,

  // Public API Service
  PUBLIC_API: 3100,

  // Monitoring Services
  PERSES: 8080,
  VICTORIA_METRICS: 8428,
};

