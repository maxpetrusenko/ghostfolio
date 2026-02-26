# AGENTS.md — Ghostfolio

## Scope
- Repo: `ghostfolio`
- Domain: finance only

## Load Policy (strict)
- Never preload large docs.
- Read only what the current task needs.
- Do not paste full instruction catalogs into chat.
- Prefer file path references over inline long content.
- Never enumerate full skill catalogs in chat.
- Use `$ghostfolio-context` and `$skill-router` for skill selection.

## Source of Truth
1. `requirements.md`
2. `docs/adr/*` (only referenced ADR)
3. `docs/tasks/tasks.md` - task

## Lazy Load Rules
- Tasks: read open `[ ]` items only (or current task ID only).
- Changelog: `tail -n 20 CHANGELOG.md`
- ADRs: only the ADR tied to the module/task.

## Execution Flow
Plan → Instrument → Implement → Test → Evaluate → Measure

## Gates
- Planning gate: if work spans >=2 modules or >=3 steps, write plan in tasks file.
- Research gate: core changes update `docs/presearch.md`.
- ADR gate: if >3 modules or >20% perf/cost impact, add ADR in `docs/adr/`.
- Single-responsibility tools, non-overlapping.
- Guardrails on runtime + failure paths.
- Structured output validation + confidence score.
- Observability: traces, latency, tokens, cost, failures.

## Skills Install Policy
- Default install target is project-local: `.codex/skills`.
- Use project-local installs by default; if scope is unclear, ask the user whether to install project-local or global.
- Global `~/.codex/skills` installs are allowed when explicitly requested.
- For installer scripts, always pass `--dest /Users/maxpetrusenko/Desktop/Gauntlet/ghostfolio/.codex/skills` unless user requests otherwise.
- If `--dest` is missing, prefer project-local for this repo or ask the user to confirm install scope.
