# Quick Start Guide

## Install Prerequisites

```bash
# Install podman (Linux)
sudo apt-get install -y podman

# Install podman compose
pip3 install podman compose
```

## Start Development Environment

```bash
cd .container/dev

# Optional: Configure ports and settings
cp env.example .env
# Edit .env to customize ports and settings

./scripts/start.sh
```

## View Logs

```bash
# All services
./scripts/logs.sh

# Specific service
./scripts/logs.sh coordinator

# Multiple services with wildcards
./scripts/logs.sh external-bridge-*
./scripts/logs.sh external-bridge-websocket-*
```

## Stop All Services

```bash
./scripts/stop.sh
```

## Access Services

- Coordinator: http://localhost:3500
- Perses Dashboard: http://localhost:8080
- VictoriaMetrics: http://localhost:8428
- External Bridge Fetcher (Binance): http://localhost:3000
- External Bridge Fetcher (Kraken): http://localhost:3001
- External Bridge WebSocket (Binance): http://localhost:3100
- External Bridge WebSocket (Kraken): http://localhost:3101
- External Bridge Storage: http://localhost:3200

## Common Commands

```bash
# Build images
podman compose build

# Start services
podman compose up -d

# Stop services
podman compose down

# View status
podman compose ps

# Restart a service
podman compose restart coordinator

# Execute command in container
podman compose exec coordinator sh
```

See [README.md](./README.md) for full documentation.

