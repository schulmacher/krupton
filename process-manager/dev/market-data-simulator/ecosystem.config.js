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
        SYMBOLS: 'BTCUSDT,ETHUSDT',
        FETCH_INTERVAL_MS: '5000',
        FETCH_MODE: 'recording',
        PORT: '3100',
      },
    },
  ],
};

