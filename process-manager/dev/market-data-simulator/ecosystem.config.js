const PORTS = require('../../ports.js');
const { DEV_LOG_LEVEL } = require('../const.js');

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
        LOG_LEVEL: DEV_LOG_LEVEL,
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
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.MDS_STORAGE,
      },
    },
  ],
};
