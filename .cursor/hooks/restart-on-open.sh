#!/usr/bin/env bash
# Restart the local dashboard when Cursor opens this workspace.
set -euo pipefail

ROOT="${CURSOR_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LOG="/tmp/cursor-news-restart.log"

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) workspaceOpen root=$ROOT ==="
  cd "$ROOT"
  ./restart.sh
} >>"$LOG" 2>&1 &

printf '%s\n' '{}'
exit 0
