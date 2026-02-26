#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="${1:-/Users/maxpetrusenko/Desktop/Projects/skills}"
OUT_FILE="${2:-$PWD/output/skills-security-check.md}"

if [ ! -d "$SKILLS_DIR" ]; then
  echo "Skills directory not found: $SKILLS_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d | sort > "$tmp_file"

{
  echo "# Skills Security Check"
  echo
  echo "- Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Skills directory: \`$SKILLS_DIR\`"
  echo
  echo "## Local Static Signals"
  echo
  echo "| Skill | Heuristic score (0-100) | Notes |"
  echo "|---|---:|---|"
} > "$OUT_FILE"

while IFS= read -r skill_dir; do
  [ -n "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  findings="$(rg -n "curl\\s+\\|\\s*sh|wget\\s+\\|\\s*sh|rm\\s+-rf|shell=True|os\\.system\\(|eval\\(|exec\\(|subprocess\\.(Popen|run)|child_process\\.(exec|spawn)" "$skill_dir" --glob '*.{md,py,sh,js,ts}' || true)"
  count="$(printf "%s\n" "$findings" | sed '/^$/d' | wc -l | tr -d ' ')"
  score=$((100 - count * 5))
  if [ "$score" -lt 0 ]; then
    score=0
  fi
  if [ "$count" -eq 0 ]; then
    notes="No risky command patterns matched."
  else
    notes="$count pattern hits. Manual review required."
  fi
  echo "| $skill_name | $score | $notes |" >> "$OUT_FILE"
done < "$tmp_file"

cat >> "$OUT_FILE" <<'EOF'

## External Scanner Gate (required)

Record external scanner verdicts before enabling a new skill for regular use.

| Scanner | Target | Result | Pass/Fail |
|---|---|---|---|
| SkillScanner | repo/skill URL | PENDING | PENDING |
| Bitdefender AI Skills Checker | repo/skill URL | PENDING | PENDING |
| SkillScan | repo/skill URL | PENDING | PENDING |

Policy:
- Block if any scanner reports critical/high risk or explicit credential theft/prompt injection risk.
- Require manual review if scanner results are missing or conflicting.
- Recommended allow threshold for SkillScanner trust score: >= 80.
EOF

echo "Wrote $OUT_FILE"
