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
        // SYMBOLS: 'BTCUSDT,ETHUSDT',
        // SYMBOLS: 'ETHUSDT',
        SYMBOLS: '',
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
        },
      },
  ],
};

