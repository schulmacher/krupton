const PORTS = require('../../ports.js');
const { DEV_LOG_LEVEL } = require('../const.js');

module.exports = {
  apps: [
    {
      name: 'coordinator',
      script: 'pnpm',
      args: '--filter coordinator dev',
      cwd: '../../../',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PROCESS_NAME: 'coordinator',
        LOG_LEVEL: DEV_LOG_LEVEL,
        PORT: PORTS.COORDINATOR,
        SHARD_COORDINATOR_BIND_PORT: 5555,
        SHARD_COORDINATOR_BIND_HOST: 'tcp://0.0.0.0',
        HEARTBEAT_TIMEOUT_SECONDS: 15,
        HEARTBEAT_CHECK_INTERVAL_SECONDS: 5,
      },
    },
  ],
};

