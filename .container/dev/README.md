# Podman Development Environment

This directory contains Podman container configurations for running the development environment, replacing PM2 for service orchestration.

## Overview

The following services are containerized:
- **coordinator** (port 3500)
- **external-bridge-binance-fetcher** (port 3000)
- **external-bridge-kraken-fetcher** (port 3001)
- **external-bridge-binance-websocket** (port 3100)
- **external-bridge-kraken-websocket** (port 3101)
- **external-bridge-storage** (port 3200)
- **perses** (port 8080)
- **victoriametrics** (port 8428)

**Note**: The `packages-build` watcher remains managed by PM2 in `process-manager/dev/packages/ecosystem.config.js`.

## Docker Images

The configuration uses the following official Docker images:

**Node.js Services:**
- Base Image: `node:24-slim` with pnpm installed
- Used for: coordinator, external-bridge services

**Monitoring Services:**
- **Perses v0.50.0**: `persesdev/perses:v0.50.0` ([docs](https://perses.dev/perses/docs/installation/in-a-container/))
- **VictoriaMetrics v1.108.1**: `victoriametrics/victoria-metrics:v1.108.1` ([docs](https://docs.victoriametrics.com/victoriametrics/quick-start/))

## Prerequisites

### Install Podman

#### On Linux (Debian/Ubuntu)
```bash
sudo apt-get update
sudo apt-get install -y podman
```

#### On Fedora/RHEL
```bash
sudo dnf install -y podman
```

#### On macOS
```bash
brew install podman
podman machine init
podman machine start
```

### Install podman compose

```bash
pip3 install podman compose
```

Or using pipx (recommended):
```bash
pipx install podman compose
```

Verify installation:
```bash
podman compose --version
```

## Quick Start

### 1. Start All Services

```bash
cd .container/dev
chmod +x scripts/*.sh
./scripts/start.sh
```

This will:
- Build all container images (if not already built)
- Start all services in detached mode
- Display service status and URLs

### 2. View Logs

View all logs:
```bash
./scripts/logs.sh
```

View logs for a specific service:
```bash
./scripts/logs.sh coordinator
./scripts/logs.sh external-bridge-binance-fetcher
```

View logs for multiple services using wildcards:
```bash
# All external-bridge services
./scripts/logs.sh external-bridge-*

# All websocket services
./scripts/logs.sh external-bridge-websocket-*

# All fetcher services
./scripts/logs.sh external-bridge-fetcher-*
```

Or use podman compose directly:
```bash
podman compose logs -f [service-name]
```

### 3. Stop All Services

```bash
./scripts/stop.sh
```

## Manual Commands

### Build Images
```bash
podman compose build
```

Build a specific service:
```bash
podman compose build coordinator
```

### Start Services
```bash
podman compose up -d
```

Start a specific service:
```bash
podman compose up -d coordinator
```

### Stop Services
```bash
podman compose down
```

### Restart a Service
```bash
podman compose restart coordinator
```

### View Running Containers
```bash
podman compose ps
```

### Execute Commands in a Container
```bash
podman compose exec coordinator sh
```

### Remove All Containers and Volumes
```bash
podman compose down -v
```

## Service URLs

After starting services, they will be available at:

- **Coordinator**: http://localhost:3500
- **External Bridge Fetcher (Binance)**: http://localhost:3000
- **External Bridge Fetcher (Kraken)**: http://localhost:3001
- **External Bridge WebSocket (Binance)**: http://localhost:3100
- **External Bridge WebSocket (Kraken)**: http://localhost:3101
- **External Bridge Storage**: http://localhost:3200
- **Perses Dashboard**: http://localhost:8080
- **VictoriaMetrics**: http://localhost:8428

## Storage Volumes

Services have access to the following storage directories:

- **Perses**: `storage/perses/`
- **VictoriaMetrics**: `storage/victoria_metrics/`
- **External Bridge Services**: `storage/` (all subdirectories: `binance/`, `kraken/`, etc.)

## Systemd Integration (Linux VPS)

For production deployment on a Linux VPS with systemd:

### 1. Update the Service File

Edit `podman compose-dev.service`:
- Update `WorkingDirectory` to your monorepo path
- Update `User` and `Group` to your username/group
- Verify `ExecStart` and `ExecStop` paths

### 2. Install the Service

```bash
# Copy the service file to systemd directory
sudo cp podman compose-dev.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable podman compose-dev

# Start the service
sudo systemctl start podman compose-dev

# Check status
sudo systemctl status podman compose-dev
```

### 3. Manage the Service

```bash
# Start
sudo systemctl start podman compose-dev

# Stop
sudo systemctl stop podman compose-dev

# Restart
sudo systemctl restart podman compose-dev

# View logs
sudo journalctl -u podman compose-dev -f
```

## Troubleshooting

**See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for a comprehensive troubleshooting guide.**

### Container Won't Start

Check logs for the specific service:
```bash
podman compose logs coordinator
```

### Port Already in Use

Check if ports are already occupied:
```bash
sudo netstat -tulpn | grep :3500
```

Stop conflicting services or change ports in `docker-compose.yml`.

### Permission Denied on Storage

Ensure storage directories exist and have correct permissions:
```bash
mkdir -p ../../storage/perses
mkdir -p ../../storage/victoria_metrics
chmod -R 755 ../../storage
```

### Rebuild After Code Changes

Node.js services use volume mounts, so code changes are reflected immediately. No rebuild needed unless:
- Dockerfile changes
- Package.json dependencies change (run `pnpm install` inside container)

To reinstall dependencies:
```bash
podman compose exec coordinator pnpm install
```

### Clean Start

Remove all containers, images, and volumes:
```bash
podman compose down -v
podman system prune -a
./scripts/start.sh
```

## Development Workflow

### Making Code Changes

1. Edit code in your IDE (on host machine)
2. Changes are immediately reflected in containers via volume mounts
3. Services auto-reload if configured (check package.json dev scripts)

### Adding New Services

1. Add service definition to `docker-compose.yml`
2. Configure environment variables
3. Add port mapping
4. Run `podman compose up -d [service-name]`

### Viewing Service Health

```bash
# Check all containers
podman compose ps

# Check specific service logs
podman compose logs -f coordinator

# Execute commands in container
podman compose exec coordinator sh
```

## Migration from PM2

The PM2 configuration (`process-manager/dev/`) is kept for the `packages-build` watcher only. All other services now run in Podman containers.

To run both:
1. Start PM2 for package building: `pm2 start process-manager/dev/packages/ecosystem.config.js`
2. Start Podman services: `./scripts/start.sh`

## Environment Variables

Environment variables can be customized in the `.env` file, which is automatically loaded by Podman Compose:

### Setup
1. Copy the template: `cp env.example .env`
2. Modify values in `.env` as needed
3. Run `podman compose up -d` (automatically reads `.env`)

### Available Variables

**Port Configuration:**
- `COORDINATOR_PORT` (default: 3500)
- `EXTERNAL_BRIDGE_FETCHER_BINANCE_PORT` (default: 3000)
- `EXTERNAL_BRIDGE_FETCHER_KRAKEN_PORT` (default: 3001)
- `EXTERNAL_BRIDGE_WEBSOCKET_BINANCE_PORT` (default: 3100)
- `EXTERNAL_BRIDGE_WEBSOCKET_KRAKEN_PORT` (default: 3101)
- `EXTERNAL_BRIDGE_STORAGE_PORT` (default: 3200)
- `PERSES_PORT` (default: 8080)
- `VICTORIA_METRICS_PORT` (default: 8428)
- `SHARD_COORDINATOR_BIND_PORT` (default: 5555)

**General Configuration:**
- `NODE_ENV` (default: development)
- `LOG_LEVEL` (default: info)
- `GOMAXPROCS` (default: 2)
- `RETENTION_PERIOD` (default: 12)
- `HEARTBEAT_TIMEOUT_SECONDS` (default: 15)
- `HEARTBEAT_CHECK_INTERVAL_SECONDS` (default: 5)
- `SHARD_COORDINATOR_BIND_HOST` (default: tcp://0.0.0.0)

All variables have default values (shown above), so the `.env` file is optional. Create it only if you need to override defaults.

## Network Configuration

All services are connected via the `dev-network` bridge network, allowing inter-service communication using container hostnames:
- `coordinator`
- `fetcher-binance`
- `fetcher-kraken`
- `websocket-binance`
- `websocket-kraken`
- `storage`
- `perses`
- `victoriametrics`

Example: From `external-bridge-binance-fetcher`, connect to coordinator at `http://coordinator:3500`.

## Notes

- Services restart automatically unless stopped manually (`restart: unless-stopped`)
- All Node.js services run `pnpm install` on startup to ensure dependencies are up to date
- Monitoring services use official Docker images:
  - Perses: `persesdev/perses:v0.50.0`
  - VictoriaMetrics: `victoriametrics/victoria-metrics:v1.108.1`
- Storage volumes persist data across container restarts
- **Build Context Optimization**: The `.dockerignore` file at the monorepo root excludes the `storage/` directory from the Docker build context, preventing disk space issues and speeding up builds. The storage directory is mounted as a volume at runtime instead.

