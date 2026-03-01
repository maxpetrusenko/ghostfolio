# Intent Capture Reliability Plan (Typos + Wording Variants)

Date: 2026-03-01

## Goal

Improve tool routing reliability when users misspell terms or use varied phrasing, while preserving policy safety gates and deterministic verification output.

## Fit Check Against Current Architecture

1. `ai-agent.utils.ts` already has `normalizeIntentQuery(...)` and typo aliases.
2. `determineToolPlan(...)` is regex-heavy and deterministic, so it is the right insertion point for better intent scoring.
3. `ai-agent.policy.utils.ts` already has read-only fallback intent scoring for empty planner output, so this can be reused and extended.
4. `ai.service.ts` already separates planning, policy, tool execution, verification, and answer rendering; this supports strict-tool-output + renderer pattern without architectural changes.

## Proposed Steps

1. Extend token normalization aliases and near-match handling for finance domain misspellings.
2. Introduce tool-family intent scoring in planner and combine it with existing regex triggers.
3. Add ambiguous-intent LLM fallback with strict JSON schema and confidence threshold; run only when planner+policy cannot confidently select tools.
4. Preserve deterministic tool outputs and verification payloads; keep human-friendly phrasing in answer renderer.
5. Expand tests and eval rows for typo/paraphrase regressions.

## Risk Controls

1. Keep policy allowlist and confirmation gates unchanged.
2. Keep low-confidence abstain and escalation behavior unchanged.
3. Add negative tests for unsafe or unauthorized prompts.
