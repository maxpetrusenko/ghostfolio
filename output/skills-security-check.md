# Skills Security Check

- Generated: 2026-02-26T17:10:57Z
- Skills directory: `/Users/maxpetrusenko/Desktop/Gauntlet/ghostfolio/.agents/skills`

## Local Static Signals

| Skill | Heuristic score (0-100) | Notes |
|---|---:|---|
| security-best-practices | 0 | 29 pattern hits. Manual review required. |
| security-ownership-map | 85 | 3 pattern hits. Manual review required. |
| security-threat-model | 100 | No risky command patterns matched. |

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
