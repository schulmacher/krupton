#!/bin/bash
set -e

# Change to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$COMPOSE_DIR"

echo "Starting development containers with podman compose..."

# Build images if needed
podman compose build

# Start all services
podman compose up -d

echo ""
echo "✅ All services started successfully!"
echo ""
echo "Service status:"
podman compose ps
echo ""
echo "Logs: podman compose logs -f [service-name]"
echo "Stop: podman compose down"
echo ""
echo "Available services:"
echo "  - coordinator: http://localhost:3500"
echo "  - external-bridge-fetcher-binance: http://localhost:3000"
echo "  - external-bridge-fetcher-kraken: http://localhost:3001"
echo "  - external-bridge-websocket-binance: http://localhost:3100"
echo "  - external-bridge-websocket-kraken: http://localhost:3101"
echo "  - external-bridge-storage: http://localhost:3200"
echo "  - perses: http://localhost:8080"
echo "  - victoriametrics: http://localhost:8428"


