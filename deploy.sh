#!/bin/bash
set -e

echo "=== Pulling latest changes from GitHub ==="
git fetch origin
git reset --hard origin/main

echo "=== Rebuilding and restarting Docker container ==="
docker compose build
docker compose up -d

echo "=== Health check ==="
sleep 4
curl -s http://127.0.0.1:4173/api/health
echo ""
echo "=== Done! ==="
