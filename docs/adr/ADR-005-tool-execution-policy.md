# ADR-005: Tool execution policy and rate governance

**Status**: Accepted
**Date**: 2026-02-25
**Context**: Control tool behavior, enforce safety, and cap unbounded costs before scaling out tool families.

## Options Considered

### Option A: Intent-group allowlists + per-tool limits
Keep route decisions in intent policy, add allowlist matrix and per-tool invocation caps.

- Pros
  - Predictable behavior and simpler auditability.
- Cons
  - More policy configuration.

### Option B: No hard policy limits
Run tool sets from prompt interpretation only.

- Pros
  - Fastest baseline with fewer guards.
- Cons
  - Higher risk of over-calls, latency spikes, and budget drift.

## Decision

Use Option A with explicit intent router allowlists, per-tool max calls, and deterministic fallback on LLM timeout or policy block.

## Trade-offs / Consequences

- Positive: bounded failures, predictable load profile, safer rollout.
- Negative: policy maintenance cost grows with each new tool.

## What Would Change Our Mind

- Tool families become mostly local and deterministic with no risk of policy abuse.
- Cost and latency gates are unnecessary due to strict service-level SLO control.

## Related

- Tests: `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts`, `apps/api/src/app/endpoints/ai/ai.service.spec.ts`
- PR/commit: Pending
- Supersedes: none
