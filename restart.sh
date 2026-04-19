#!/bin/bash
# Combined script to build and start the WhatsApp Assistant stack.

# Stop on any error
set -e

echo "Starting full rebuild and launch sequence..."

# Ensure we're in the right directory
cd "$(dirname "$0")"

# 1. Build
./build.sh

# 2. Start
./start.sh
