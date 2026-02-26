#!/usr/bin/env bash
set -euo pipefail

INDEX_FILE="${1:-/Users/maxpetrusenko/Desktop/Projects/skills/index.md}"
QUERY="${2:-}"
LIMIT="${3:-15}"

if [ -z "$QUERY" ]; then
  echo "Usage: bash scripts/find-skills.sh [index_file] \"query terms\" [limit]" >&2
  exit 1
fi

if [ ! -f "$INDEX_FILE" ]; then
  echo "Index file not found: $INDEX_FILE" >&2
  exit 1
fi

awk -F'\\|' -v query="$QUERY" -v limit="$LIMIT" '
BEGIN {
  q = tolower(query)
  n = split(q, terms, /[[:space:]]+/)
}
NR <= 4 { next }
{
  skill = $1
  keys = $2
  path = $3
  gsub(/^ +| +$/, "", skill)
  gsub(/^ +| +$/, "", keys)
  gsub(/^ +| +$/, "", path)
  text = tolower(skill " " keys " " path)
  score = 0
  for (i = 1; i <= n; i++) {
    if (terms[i] == "") continue
    if (index(tolower(skill), terms[i]) > 0) score += 5
    else if (index(text, terms[i]) > 0) score += 2
  }
  if (score > 0) {
    printf "%d\t%s\t%s\n", score, skill, path
  }
}
' "$INDEX_FILE" | sort -t$'\t' -k1,1nr -k2,2 | head -n "$LIMIT"
