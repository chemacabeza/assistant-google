#!/bin/bash
# Builds the Docker container images without starting them.

echo "========================================"
echo "Building Antigravity Assistant Stack..."
echo "========================================"

# Make sure we're in the repository root
cd "$(dirname "$0")" || { echo "Failed to change directory"; exit 1; }

# 1. Clean up and fix permissions
echo "🔧 Cleaning environment and fixing permissions..."
docker run --rm -v "$(pwd):/app" alpine sh -c "rm -rf /app/frontend/dist && chown -R $(id -u):$(id -g) /app"

# 2. Host-side Compilation (Using the portable Node 20 to bypass all issues)
echo "🚀 Compiling frontend on host (using portable Node 20)..."
if [[ ! -d "frontend/node20" ]]; then
    echo "   ↓ Downloading portable Node 20..."
    curl -fsSL https://nodejs.org/dist/v20.11.1/node-v20.11.1-linux-x64.tar.xz -o node20.tar.xz
    mkdir -p frontend/node20
    tar -xJf node20.tar.xz -C frontend/node20 --strip-components=1
    rm node20.tar.xz
fi

export PATH="$(pwd)/frontend/node20/bin:$PATH"
cd frontend
echo "   ⚙️  Installing dependencies..."
npm install
echo "   🚀 Running Vite build..."
npm run build
cd ..

# 3. Build the final production images
echo "🐳 Building production Docker images..."
docker compose build

echo "========================================"
echo "Build complete! Run ./start.sh to launch."
echo "========================================"
