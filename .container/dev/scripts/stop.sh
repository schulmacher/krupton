#!/bin/bash
set -e

# Change to the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$COMPOSE_DIR"

echo "Stopping development containers..."

# Stop all services
podman compose down

echo "✅ All services stopped successfully!"


