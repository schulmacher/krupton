const PORTS = require('../../ports.js');
const { DEV_LOG_LEVEL } = require('../const.js');

module.exports = {
  apps: [
    {
      name: 'external-bridge-fetcher',
      script: 'pnpm',
      args: '--filter external-bridge dev:fetcher',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'external-bridge-fetcher',
        PLATFORM: 'binance',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.EXTERNAL_BRIDGE_FETCHER,
        SYMBOLS: 'BTCUSDT,ETHUSDT',
        // SYMBOLS: 'KASUSDT,USDTKAS',
        // SYMBOLS: 'ETHUSDT',
        // SYMBOLS: '',
      },
    },
    {
      name: 'external-bridge-websocket',
      script: 'pnpm',
      args: '--filter external-bridge dev:websocket',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'external-bridge-websocket',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.EXTERNAL_BRIDGE_WEBSOCKET,
      },
    },
    {
      name: 'external-bridge-storage',
      script: 'pnpm',
      args: '--filter external-bridge dev:storage',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'external-bridge-storage',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.EXTERNAL_BRIDGE_STORAGE,
      },
    },
  ],
};
