const marketDataSimulator = require('./market-data-simulator/ecosystem.config');
const packages = require('./packages/ecosystem.config');

module.exports = {
  apps: [...packages.apps, ...marketDataSimulator.apps],
};

