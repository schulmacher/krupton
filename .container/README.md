# Container Configurations

This directory contains Podman/Docker container configurations for different environments.

## Directory Structure

```
.container/
└── dev/          # Development environment configuration
```

## Available Environments

### Development (`dev/`)

Podman-based development environment replacing PM2 for most services.

**Quick Start:**
```bash
cd dev
./scripts/start.sh
```

See [dev/README.md](./dev/README.md) for complete documentation.

**Services:**
- coordinator (port 3500)
- external-bridge-fetcher-binance (port 3000)
- external-bridge-fetcher-kraken (port 3001)
- external-bridge-websocket-binance (port 3100)
- external-bridge-websocket-kraken (port 3101)
- external-bridge-storage (port 3200)
- perses (port 8080)
- victoriametrics (port 8428)

## Migration from PM2

The PM2 configuration in `process-manager/dev/` is now only used for the `packages-build` watcher. All other services have been migrated to Podman containers.

See [dev/MIGRATION.md](./dev/MIGRATION.md) for migration guide and command comparisons.

## Future Configurations

Additional environment configurations may be added:
- `prod/` - Production configuration
- `staging/` - Staging environment
- `test/` - Testing environment

## Prerequisites

- **Podman**: Container runtime
- **podman compose**: Docker Compose compatibility for Podman

See [dev/README.md](./dev/README.md) for installation instructions.


