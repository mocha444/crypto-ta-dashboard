#!/usr/bin/env bash
# Default redeploy: rebuild image from code + restart container.
# Keeps the .cache/ volume intact (does NOT wipe data).
# Use ./redeploy-full.sh when you want a FULL reset (down -v, fresh cache).
set -euo pipefail

cd "$(dirname "$0")"
echo "→ building from current code + restarting"
sudo docker compose up -d --build

echo "✓ done.  Check with: sudo docker compose ps"
