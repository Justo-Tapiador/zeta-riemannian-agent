#!/bin/bash
# Supervisor: restart the agent-runtime if it exits.
# Resolves the runtime directory relative to this script's location so it
# works on any machine, not just the original author's.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$SCRIPT_DIR/../mini-services/agent-runtime"
cd "$RUNTIME_DIR" || { echo "[supervisor] cannot cd to $RUNTIME_DIR" >&2; exit 1; }
while true; do
  echo "[supervisor] starting agent-runtime at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  stdbuf -oL bun index.ts
  EXIT_CODE=$?
  echo "[supervisor] agent-runtime exited with code $EXIT_CODE at $(date -u +%Y-%m-%dT%H:%M:%SZ), restarting in 3s..."
  sleep 3
done
