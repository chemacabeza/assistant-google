#!/bin/bash
# Builds the Docker container images without starting them.

echo "========================================"
echo "Building Antigravity Assistant Stack..."
echo "========================================"

set -o pipefail

# Make sure we're in the repository root
cd "$(dirname "$0")" || { echo "Failed to change directory"; exit 1; }

# All images are built inside Docker (multi-stage), so only Docker is required on the host.
echo "Building production Docker images..."
# Services build with `network: host`, which buildx bake only permits when the
# network.host entitlement is granted explicitly, so drive bake directly.
docker compose build --print "$@" | docker buildx bake --allow=network.host --load -f - \
  || { echo "Build failed"; exit 1; }


echo "========================================"
echo "Build complete! Run ./start.sh to launch."
echo "========================================"
