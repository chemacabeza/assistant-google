#!/usr/bin/env bash
# Runs the end-to-end suite (backend, whatsapp-bridge, frontend) against an isolated stack:
# own compose project, own database volume, own ports and fake Google credentials.
# Your normal stack and data are never touched.
#
#   e2e/run.sh                         # everything
#   e2e/run.sh --project=backend       # one area (backend | bridge | frontend | ui | authenticated | auth-flow | destructive)
#   E2E_KEEP_STACK=1 e2e/run.sh        # leave the stack running afterwards
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PROJECT=assistant-e2e
COMPOSE=(docker compose -p "$PROJECT" -f "$ROOT/docker-compose.yml" -f "$ROOT/e2e/docker-compose.e2e.yml")

# Use the portable Node that build.sh used to download if the system has none.
if ! command -v npm >/dev/null 2>&1 && [[ -x "$ROOT/frontend/node20/bin/npm" ]]; then
  export PATH="$ROOT/frontend/node20/bin:$PATH"
fi
command -v npm >/dev/null 2>&1 || { echo "npm not found: install Node 20+" >&2; exit 1; }

cleanup() {
  if [[ "${E2E_KEEP_STACK:-0}" != "1" ]]; then
    "${COMPOSE[@]}" down -v --remove-orphans || echo "warning: could not remove the e2e stack (project $PROJECT)" >&2
  fi
}
trap cleanup EXIT

echo "Starting isolated e2e stack..."
"${COMPOSE[@]}" up -d --build --wait --wait-timeout 300

cd e2e
[[ -d node_modules ]] || npm ci
npx playwright install chromium
npx playwright test "$@"
