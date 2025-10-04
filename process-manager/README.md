# Process Manager

PM2 configuration files for managing application processes in development and production environments.

## Directory Structure

```
process-manager/
├── dev/
│   ├── packages/
│   │   └── ecosystem.config.js
│   ├── market-data-simulator/
│   │   └── ecosystem.config.js
│   └── ecosystem.config.js
└── README.md
```

## Available Commands

All commands should be run from the monorepo root.

### Starting Services

```bash
# Start all development services (packages build + applications)
pnpm pm2:dev

# Start package builds in watch mode
pnpm pm2:dev:packages

# Start all market-data-simulator services
pnpm pm2:dev:mds

# Start only the mds-fetcher service
pnpm pm2:dev:mds-fetcher
```

### Managing Services

```bash
# View process status
pnpm pm2:status

# View logs from all processes
pnpm pm2:logs

# Monitor processes in real-time
pnpm pm2:monit

# Restart all processes
pnpm pm2:restart

# Stop all processes
pnpm pm2:stop

# Remove all processes from PM2
pnpm pm2:delete
```

### Direct PM2 Commands

You can also use PM2 commands directly for more control:

```bash
# Start specific service
pm2 start mds-fetcher

# Stop specific service
pm2 stop mds-fetcher

# Restart specific service
pm2 restart mds-fetcher

# View logs for specific service
pm2 logs mds-fetcher

# Use wildcard patterns for related services
pm2 restart "mds-*"
pm2 stop "mds-*"
```

## Configuration

### Packages Build Service

Location: `process-manager/dev/packages/ecosystem.config.js`

Builds all packages in the `packages/` directory in watch mode:
- `@krupton/service-framework-node`
- `@krupton/interface`
- `@krupton/utils`

The `@krupton/config` package doesn't need building as it only exports configuration files.

### Market Data Simulator - Fetcher Service

Location: `process-manager/dev/market-data-simulator/ecosystem.config.js`

Default environment variables:
- `NODE_ENV`: development
- `PROCESS_NAME`: mds-fetcher
- `PLATFORM`: binance
- `SYMBOLS`: BTCUSDT,ETHUSDT
- `FETCH_INTERVAL_MS`: 5000
- `FETCH_MODE`: recording
- `PORT`: 3100

To modify configuration, edit the ecosystem.config.js file and restart the service.

## Adding New Services

1. Create a new directory under `process-manager/dev/` for your application
2. Create an `ecosystem.config.js` file with your service configuration
3. **Important:** When starting a new process, use the `pm2:dev:*` script from package.json. If you need to restart after config changes, delete the process first (`pm2 delete <name>`) and start it fresh to ensure the correct working directory is used.
4. Add the configuration to `process-manager/dev/ecosystem.config.js`:

```javascript
const yourApp = require('./your-app/ecosystem.config');

module.exports = {
  apps: [
    ...marketDataSimulator.apps,
    ...yourApp.apps
  ]
};
```

4. Add convenience scripts to root `package.json` if desired

## References

See `docs/004_process_management_pm2.md` for detailed documentation on PM2 usage and architecture.

