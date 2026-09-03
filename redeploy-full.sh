#!/usr/bin/env bash
# Redeploy the crypto-ta-dashboard container with a fresh cache.
# Wipes the .cache/ volume so stale TTLs can't cause a stuck "refreshing…"
# state on first request after a rebuild.
set -euo pipefail

cd "$(dirname "$0")"

echo "→ stopping container"
sudo docker compose down

echo "→ wiping cache volume"
sudo docker compose down -v  # idempotent: safe to run after the first down

echo "→ rebuilding image (no cache)"
sudo docker compose build --no-cache

echo "→ starting fresh container"
sudo docker compose up -d

echo "✓ done.  Tail logs with:  sudo docker compose logs -f"
