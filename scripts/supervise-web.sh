#!/bin/bash
# Supervisor: restart the native web server if it exits.
# Resolves the project root relative to this script's location so it
# works on any machine, not just the original author's.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
cd "$PROJECT_ROOT" || { echo "[supervisor-web] cannot cd to $PROJECT_ROOT" >&2; exit 1; }
while true; do
  echo "[supervisor-web] starting web/server.js at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  bun web/server.js
  EXIT_CODE=$?
  echo "[supervisor-web] web/server.js exited with code $EXIT_CODE at $(date -u +%Y-%m-%dT%H:%M:%SZ), restarting in 3s..."
  sleep 3
done
