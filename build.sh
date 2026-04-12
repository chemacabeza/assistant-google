#!/bin/bash
# Builds the Docker container images without starting them.

echo "========================================"
echo "Building Antigravity Assistant Stack..."
echo "========================================"

# Make sure we're in the repository root
cd "$(dirname "$0")" || { echo "Failed to change directory"; exit 1; }

# Build the docker compose stack
docker compose build

echo "========================================"
echo "Build complete! Run ./start.sh to launch."
echo "========================================"
