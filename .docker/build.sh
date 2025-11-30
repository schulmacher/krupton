#!/usr/bin/env bash
set -euo pipefail

# --------------------------------------------------------------------
# Build the shared monorepo Node 24 base image
# --------------------------------------------------------------------

# Figure out where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_NAME="krupton-node-base"
DOCKERFILE_PATH="$SCRIPT_DIR/node24-base.Dockerfile"

echo "🛠  Building base image: $IMAGE_NAME"
echo "📄  Dockerfile: $DOCKERFILE_PATH"
echo "📂  Context: $REPO_ROOT"
echo

docker build \
  -t "$IMAGE_NAME" \
  -f "$DOCKERFILE_PATH" \
  "$REPO_ROOT"

echo
echo "✅  Build complete: $IMAGE_NAME"
docker images "$IMAGE_NAME"
