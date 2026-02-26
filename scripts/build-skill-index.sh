#!/usr/bin/env bash
set -euo pipefail

LIB_DIR="${1:-/Users/maxpetrusenko/Desktop/Projects/skills}"
OUT_FILE="${2:-$LIB_DIR/index.md}"

mkdir -p "$LIB_DIR"

{
  echo "# Local Skill Index"
  echo "# Format: skill_id | keywords | absolute_path_to_skill_md"
  echo "# Source: /Users/maxpetrusenko/Desktop/Projects/skills"
  echo "# Fill keywords manually for better routing."
} > "$OUT_FILE"

find "$LIB_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md | sort | while read -r skill_md; do
  skill_id="$(basename "$(dirname "$skill_md")")"
  keywords="$(echo "$skill_id" | tr '-' ',' )"
  echo "$skill_id | $keywords | $skill_md" >> "$OUT_FILE"
done

echo "Wrote $OUT_FILE"
