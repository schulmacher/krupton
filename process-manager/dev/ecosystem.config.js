const marketDataSimulator = require('./external-bridge/ecosystem.config');
const packages = require('./packages/ecosystem.config');
const victoriaMetrics = require('./victoria-metrics/ecosystem.config');
const perses = require('./monitoring/ecosystem.config');

module.exports = {
  apps: [...packages.apps, ...victoriaMetrics.apps, ...perses.apps, ...marketDataSimulator.apps],
};

