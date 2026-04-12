#!/bin/bash
# Stops and removes the application containers. Volume data (Postgres) is preserved.

echo "========================================"
echo "Stopping Antigravity Assistant Stack..."
echo "========================================"

cd "$(dirname "$0")" || { echo "Failed to change directory"; exit 1; }

# Strip down the containers but keep volumes
docker compose down

echo "========================================"
echo "Successfully stopped all services."
echo "Note: The database volume (postgres_data) has been preserved."
echo "========================================"
