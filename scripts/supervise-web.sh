#!/bin/bash
# Supervisor: restart the native web server if it exits.
cd /home/z/my-project
while true; do
  echo "[supervisor-web] starting web/server.js at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  bun web/server.js
  EXIT_CODE=$?
  echo "[supervisor-web] web/server.js exited with code $EXIT_CODE at $(date -u +%Y-%m-%dT%H:%M:%SZ), restarting in 3s..."
  sleep 3
done
