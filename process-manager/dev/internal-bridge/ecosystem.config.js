const PORTS = require('../../ports.js');
const { DEV_LOG_LEVEL } = require('../const.js');

module.exports = {
  apps: [
    {
      name: 'internal-bridge-transformer-binance-orders',
      script: 'pnpm',
      args: '--filter internal-bridge dev:transformer-binance-orders',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'internal-bridge-transformer-binance-orders',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.INTERNAL_BRIDGE_BINANCE_ORDERS_TRANSFORMER,
      },
    },
    {
      name: 'internal-bridge-transformer-binance-trades',
      script: 'pnpm',
      args: '--filter internal-bridge dev:transformer-binance-trades',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'internal-bridge-transformer-binance-trades',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.INTERNAL_BRIDGE_BINANCE_TRADES_TRANSFORMER,
      },
    },
    {
      name: 'internal-bridge-transformer-kraken-orders',
      script: 'pnpm',
      args: '--filter internal-bridge dev:transformer-kraken-orders',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'internal-bridge-transformer-kraken-orders',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.INTERNAL_BRIDGE_KRAKEN_ORDERS_TRANSFORMER,
      },
    },
    {
      name: 'internal-bridge-transformer-kraken-trades',
      script: 'pnpm',
      args: '--filter internal-bridge dev:transformer-kraken-trades',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'internal-bridge-transformer-kraken-trades',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.INTERNAL_BRIDGE_KRAKEN_TRADES_TRANSFORMER,
      },
    },
    {
      name: 'internal-bridge-flink-grpc-storage-server',
      script: 'pnpm',
      args: '--filter internal-bridge dev:grpc-storage-server',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'internal-bridge-grpc-storage-server',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.INTERNAL_BRIDGE_FLINK_GRPC_STORAGE,
        GRPC_PORT: PORTS.INTERNAL_BRIDGE_FLINK_GRPC_STORAGE_GRPC_PORT,
      },
    },
  ],
};
