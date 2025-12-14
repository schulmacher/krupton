const PORTS = require('../../ports.js');
const { DEV_LOG_LEVEL } = require('../const.js');

module.exports = {
  apps: [
    {
      name: 'py-predictor',
      script: 'pnpm',
      args: '--filter py-predictor dev',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'py-predictor',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.PY_PREDICTOR,
        PYTHONUNBUFFERED: '1',  // ← Add this line
        // SYMBOLS: 'btc_usdt,eth_usdt',
        // SYMBOLS: 'KASUSDT,USDTKAS',
        // SYMBOLS: 'ETHUSDT',
        // SYMBOLS: '',
      },
    },
  ],
};
