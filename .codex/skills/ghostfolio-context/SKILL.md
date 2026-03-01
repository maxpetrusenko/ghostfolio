---
name: ghostfolio-context
description: Project-specific context router for the ghostfolio repo. Use this skill to keep context small and load only the minimal files needed by intent (planning, testing, implementation, docs).
metadata:
  short-description: Ghostfolio lazy-load router
---

# Ghostfolio Context

Purpose: minimize context usage by routing to only the files needed for the current task.

## User-Facing Status Line (required)

At task start, provide a short plan line in this format:

- `Skills loaded now: <list>`
- `Potential skills later: <list>`

Keep it brief and only include skills relevant to the current task.

## Routing Rules

1. Planning work:
- Read `tasks/tasks.md` only for open tasks (`[ ]`) or the current task ID.
- If `tasks/tasks.md` is absent, use `Tasks.md` with the same focused read rule.
- If core behavior changes are planned, then read `docs/presearch.md` and `docs/slo.md`.

2. Testing work:
- Read only tests and directly related implementation files.
- Prefer targeted test execution first (single file/suite), then broader runs if needed.
- Add regression tests for any production bug fix.

3. Changelog/history checks:
- Read only the last 20 lines of `CHANGELOG.md` unless debugging history.

4. ADR checks:
- Read only the ADR referenced by the current task/module in `docs/adr/`.

5. Deployment/onboarding changes:
- Read `README.md` only when deployment or onboarding flow is being modified.

## Operating Constraints

- Do not paste full AGENTS/skills docs into chat context.
- Prefer path references and targeted reads over full-file loads.
- Keep diffs minimal and module boundaries clear.
- Stay in finance domain constraints for tools/datasets/evals.
- Never load broad skill catalogs; load only per-task skills.
- Skill source of truth is:
  `/Users/maxpetrusenko/Desktop/Projects/skills`.
- Use as many skills as needed to resolve the task well, while avoiding redundant overlap.
- Prefer offline routing through:
  `/Users/maxpetrusenko/Desktop/Projects/skills/index.md`.

## Quick Commands

- Open tasks only:
```bash
if [ -f tasks/tasks.md ]; then rg "^\[ \]" tasks/tasks.md; else rg "^\[ \]" Tasks.md; fi
```

- Tail changelog:
```bash
tail -n 20 CHANGELOG.md
```

- List ADRs:
```bash
ls docs/adr
```

- Find focused tests (example):
```bash
rg --files | rg "(test|spec)"
```
