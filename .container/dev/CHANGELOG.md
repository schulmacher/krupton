# Changelog

## 2025-10-11

### Fixed
- **Build Context Issue**: Added `.dockerignore` file at monorepo root to exclude `storage/` directory from Docker build context
  - Fixes "no space left on device" error
  - Reduces build context from gigabytes to ~15MB
  - Speeds up builds significantly
  - Storage directory is properly mounted as volume at runtime instead

### Added
- **Environment Variable**: Added `STORAGE_BASE_DIR` to configure storage path inside containers
  - Default: `/data/storage`
  - Configurable via `.env` file
  - Applied to all external-bridge services

- **Documentation**: 
  - Created comprehensive `TROUBLESHOOTING.md` guide
  - Added build context optimization notes to README
  - Documented all available environment variables

### Changed
- Removed obsolete `version: '3.8'` from docker-compose.yml (prevents warnings)
- Updated all services to use environment variables from `.env` file
- Node.js base image updated to Node 24
- Monitoring services now use official Docker images:
  - Perses: `persesdev/perses:v0.50.0`
  - VictoriaMetrics: `victoriametrics/victoria-metrics:v1.108.1`

## Initial Setup

### Created
- Complete Podman-based development environment
- Docker Compose configuration for 8 services
- Helper scripts: `start.sh`, `stop.sh`, `logs.sh` (with wildcard support)
- Systemd service file for production deployment
- Comprehensive documentation: README.md, QUICKSTART.md, MIGRATION.md
- Environment variable configuration system

### Services
1. coordinator (port 3500)
2. external-bridge-fetcher-binance (port 3000)
3. external-bridge-fetcher-kraken (port 3001)
4. external-bridge-websocket-binance (port 3100)
5. external-bridge-websocket-kraken (port 3101)
6. external-bridge-storage (port 3200)
7. perses (port 8080)
8. victoriametrics (port 8428)

