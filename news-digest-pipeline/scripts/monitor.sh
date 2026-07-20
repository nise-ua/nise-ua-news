#!/usr/bin/env bash
#
# VPS Monitoring Script for News Digest Pipeline
# Usage: Add to crontab:  */5 * * * * /opt/news-digest-pipeline/news-digest-pipeline/scripts/monitor.sh
#

set -euo pipefail

CONTAINER_NAME="news-digest-pipeline"
HEALTH_URL="http://localhost:3000/health"
NTFY_TOPIC="${NTFY_TOPIC:-your-ntfy-topic}"
DISK_THRESHOLD=90
MEM_THRESHOLD=90

alert() {
  local message="$1"
  echo "[monitor] ALERT: $message"
  curl -s -o /dev/null \
    -H "Title: News Digest Monitor Alert" \
    -H "Priority: high" \
    -H "Tags: warning" \
    -d "$message" \
    "https://ntfy.sh/${NTFY_TOPIC}" 2>/dev/null || true
}

# Check 1: Docker container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  alert "Container '${CONTAINER_NAME}' is NOT running!"
fi

# Check 2: Health endpoint responds
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  alert "Health check failed (HTTP ${HTTP_CODE}) at ${HEALTH_URL}"
fi

# Check 3: Disk usage
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -ge "$DISK_THRESHOLD" ]; then
  alert "Disk usage is at ${DISK_USAGE}% (threshold: ${DISK_THRESHOLD}%)"
fi

# Check 4: Memory usage
if command -v free &>/dev/null; then
  MEM_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
  if [ "$MEM_USAGE" -ge "$MEM_THRESHOLD" ]; then
    alert "Memory usage is at ${MEM_USAGE}% (threshold: ${MEM_THRESHOLD}%)"
  fi
fi

echo "[monitor] $(date '+%Y-%m-%d %H:%M:%S') — checks complete"
