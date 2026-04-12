#!/bin/bash
# Starts the application in detached mode and tails the logs.

echo "========================================"
echo "Starting Antigravity Assistant Stack..."
echo "========================================"

cd "$(dirname "$0")" || { echo "Failed to change directory"; exit 1; }

# Create required env variables if they don't exist
if [ ! -f ".env" ]; then
    echo "Warning: .env file missing in root directory."
    echo "Using default/example values..."
    # We rely on .env.example values passing through docker-compose
fi

# Bring up the containers in detached mode
docker compose up -d

echo "========================================"
echo "Services started successfully:"
echo "Frontend UI:   http://localhost:5173"
echo "Backend API:   http://localhost:8080"
echo "PostgreSQL:    localhost:5432"
echo "========================================"
echo ""
# Wait for the frontend to become responsive and open the browser
(
  echo "Waiting for application logic to boot up..."
  for i in {1..30}; do
    if curl -s http://localhost:5173 > /dev/null; then
      echo "Application is ready! Opening your default browser..."
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open http://localhost:5173
      elif command -v open >/dev/null 2>&1; then
        open http://localhost:5173
      else
        echo "Please open http://localhost:5173 manually in your browser."
      fi
      break
    fi
    sleep 2
  done
) &

echo "Tailing logs (Press Ctrl+C to exit logs, the application will keep running in the background):"
docker compose logs -f
