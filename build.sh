#!/bin/bash
# Builds the Docker container images without starting them.

echo "========================================"
echo "Building Antigravity Assistant Stack..."
echo "========================================"

# Make sure we're in the repository root
cd "$(dirname "$0")" || { echo "Failed to change directory"; exit 1; }

# All images are built inside Docker (multi-stage), so only Docker is required on the host.
echo "Building production Docker images..."
docker compose build "$@" || { echo "Build failed"; exit 1; }


echo "========================================"
echo "Build complete! Run ./start.sh to launch."
echo "========================================"
