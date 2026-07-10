#!/bin/bash
# Supervisor: restart the agent-runtime if it exits.
cd /home/z/my-project/mini-services/agent-runtime
while true; do
  echo "[supervisor] starting agent-runtime at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  stdbuf -oL bun index.ts
  EXIT_CODE=$?
  echo "[supervisor] agent-runtime exited with code $EXIT_CODE at $(date -u +%Y-%m-%dT%H:%M:%SZ), restarting in 3s..."
  sleep 3
done
