# ADR-006: Tracing, correlation, and validation chain

**Status**: Accepted
**Date**: 2026-02-25
**Context**: Provide auditable, end-to-end visibility from user intent through tool calls, verification, and final answer.

## Options Considered

### Option A: Single request trace ID with nested request/tool/validation spans
Emit one trace ID from API entry through tool calls and verification checks.

- Pros
  - Fast diagnosis and strong observability.
- Cons
  - Slightly more structured instrumentation required.

### Option B: Separate traces per subsystem
Generate independent spans without explicit correlation ID between layers.

- Pros
  - Minimal integration surface change.
- Cons
- Harder root cause linking between query, tooling, and final output.

## Decision

Use Option A. Each request returns one `traceId` and propagates it through all tool and verification spans.

## Trade-offs / Consequences

- Positive: stronger support for audit logs, regression debugging, and eval trace joins.
- Negative: higher telemetry volume; sampling policy needed for high traffic.

## What Would Change Our Mind

- Stable correlation already available across all execution paths with manageable cost.
- New platform-level tracing system required for stronger compliance and SLO reporting.

## Related

- Tests: `apps/api/src/app/endpoints/ai/mvp-eval.runner.ts`, `apps/api/src/app/endpoints/ai/ai-observability.service.spec.ts`, `apps/api/src/app/endpoints/ai/evals/mvp-eval.runner.spec.ts`
- PR/commit: Pending
- Supersedes: none
