const coordinator = require('./coordinator/ecosystem.config');
const externalBridge = require('./external-bridge/ecosystem.config');
const packages = require('./packages/ecosystem.config');
const monitoring = require('./monitoring/ecosystem.config');

module.exports = {
  apps: [
    ...packages.apps,
    ...coordinator.apps,
    ...monitoring.apps,
    ...externalBridge.apps,
  ],
};

