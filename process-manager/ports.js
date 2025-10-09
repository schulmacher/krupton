/**
 * Port allocations for all services in the dev environment
 */

module.exports = {
  // Market Data Simulator Services
  EXTERNAL_BRIDGE_FETCHER: 3000,
  EXTERNAL_BRIDGE_STORAGE: 3001,
  EXTERNAL_BRIDGE_WEBSOCKET: 3002,

  // Public API Service
  PUBLIC_API: 3100,

  // Monitoring Services
  PERSES: 8080,
  VICTORIA_METRICS: 8428,
};

