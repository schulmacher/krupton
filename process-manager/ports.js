/**
 * Port allocations for all services in the dev environment
 */

module.exports = {
  // Market Data Simulator Services
  MDS_FETCHER: 3000,
  MDS_STORAGE: 3001,
  MDS_REST_API: 3002,

  // Public API Service
  PUBLIC_API: 3100,

  // Monitoring Services
  PERSES: 8080,
  VICTORIA_METRICS: 8428,
};

