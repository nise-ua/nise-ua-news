#!/usr/bin/env bash
# Bump patch version and sync display files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION_FILE="$ROOT/VERSION"
CURRENT="$(tr -d '[:space:]' < "$VERSION_FILE")"

if [[ ! "$CURRENT" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "Invalid VERSION: $CURRENT" >&2
  exit 1
fi

MAJOR="${BASH_REMATCH[1]}"
MINOR="${BASH_REMATCH[2]}"
PATCH="${BASH_REMATCH[3]}"
NEW="${MAJOR}.${MINOR}.$((PATCH + 1))"
DATE_ISO="$(date +%Y-%m-%d)"
DATE_UA="$(date +%d.%m.%Y)"

printf '%s\n' "$NEW" > "$VERSION_FILE"

perl -i -pe "s/^# News Digest Pipeline v[0-9.]+/# News Digest Pipeline v${NEW}/" "$ROOT/README.md"
perl -i -pe "s|badge/version-[0-9.]+-blue|badge/version-${NEW}-blue|" "$ROOT/README.md"

perl -i -pe "s/v[0-9.]+ &middot; [0-9]{2}\\.[0-9]{2}\\.[0-9]{4}/v${NEW} \\&middot; ${DATE_UA}/" \
  "$ROOT/news-digest-pipeline/src/public/index.html"

perl -i -pe "s/\"version\": \"[0-9.]+\"/\"version\": \"${NEW}\"/" \
  "$ROOT/news-digest-pipeline/package.json"

changelog="$ROOT/CHANGELOG.md"
header=$(mktemp)
rest=$(mktemp)
awk 'NR<=7 {print} NR==7 {exit}' "$changelog" > "$header"
awk 'NR>7 {print}' "$changelog" > "$rest"
{
  cat "$header"
  echo "## [${NEW}] — ${DATE_ISO}"
  echo
  echo "Patch bump."
  echo
  echo "---"
  echo
  cat "$rest"
} > "$changelog"
rm -f "$header" "$rest"

echo "Bumped version to v${NEW} · ${DATE_UA}"
