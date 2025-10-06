const PORTS = require('../../ports.js');

module.exports = {
  apps: [
    {
      name: 'mds-fetcher',
      script: 'pnpm',
      args: '--filter market-data-simulator dev:fetcher',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'mds-fetcher',
        PLATFORM: 'binance',
        LOG_LEVEL: 'debug',
        PORT: PORTS.MDS_FETCHER,
        SYMBOLS: 'BTCUSDT,ETHUSDT',
        // SYMBOLS: 'KASUSDT,USDTKAS',
        // SYMBOLS: 'ETHUSDT',
        // SYMBOLS: '',
      },
    },
    {
      name: 'mds-storage',
      script: 'pnpm',
      args: '--filter market-data-simulator dev:storage',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'mds-storage',
        LOG_LEVEL: 'debug',
        PORT: PORTS.MDS_STORAGE,
      },
    },
  ],
};
