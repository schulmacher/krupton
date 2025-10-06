const path = require('path');

const persesBinPath = path.resolve(__dirname, '../../../apps/monitoring-perses/bin/perses');

const persesConfigPath = path.resolve(__dirname, '../../../apps/monitoring-perses/config.yml');

const victoriaMetricsBinPath = path.resolve(
  __dirname,
  '../../../apps/monitoring-victoria-metrics/bin/victoria-metrics-prod',
);

const victoriaMetricsConfigPath = path.resolve(
  __dirname,
  '../../../apps/monitoring-victoria-metrics/prometheus.yml',
);

const victoriaMetricsDataPath = path.resolve(__dirname, '../../../storage/victoria_metrics');

module.exports = {
  apps: [
    {
      name: 'perses',
      script: persesBinPath,
      args: [`--config=${persesConfigPath}`],
      cwd: path.resolve(__dirname, '../../../apps/monitoring-perses'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'victoriametrics',
      script: victoriaMetricsBinPath,
      args: [
        `-storageDataPath=${victoriaMetricsDataPath}`,
        '-retentionPeriod=12',
        '-httpListenAddr=:8428',
        `-promscrape.config=${victoriaMetricsConfigPath}`,
      ],
      cwd: path.resolve(__dirname, '../../../apps/monitoring-victoria-metrics'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'development',
        GOMAXPROCS: '2',
      },
    },
  ],
};
