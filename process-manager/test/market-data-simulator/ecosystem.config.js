module.exports = {
  apps: [
    {
      name: 'mds-fetcher',
      script: 'dist/mdsFetcher.js',
      cwd: '../../../apps/market-data-simulator',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PROCESS_NAME: 'mds-fetcher',
        PLATFORM: 'binance',
        LOG_LEVEL: 'info',
        SYMBOLS: 'BTCUSDT,ETHUSDT',
      },
    },
  ],
};
