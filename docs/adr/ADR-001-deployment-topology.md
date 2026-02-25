# ADR-001: Deployment topology for Ghostfolio AI Agent

**Status**: Accepted
**Date**: 2026-02-25
**Context**: Decide whether the AI agent executes inside Ghostfolio API or as a dedicated sidecar service.

## Options Considered

### Option A: Embedded
Ghostfolio AI logic runs inside existing Ghostfolio API runtime and shares app modules and auth context.

- Pros
  - Fastest delivery path.
  - Lowest operational surface area.
  - Direct access to existing services (`portfolioService`, `accountService`, `auth` context).
- Cons
  - Tool execution and model latency count against API process resources.

### Option B: Sidecar
AI agent runs as a separate service with explicit HTTP/gRPC transport to Ghostfolio.

- Pros
  - Strong isolation and separate scaling profile.
  - Better fit for long-running or durable workflows.
- Cons
  - Additional deployment and auth-to-authz boundaries.
  - Higher integration and operations overhead.

## Decision

Use embedded deployment for v1 to minimize delivery risk and preserve rapid iteration.

## Trade-offs / Consequences

- Positive: fastest integration and shortest path to evaluable outcomes.
- Negative: API SLO impact risk increases if tool latency and timeouts are not capped.

## What Would Change Our Mind

- Repeated request or tool execution timeout pressure on API latency budgets.
- Requirement for durable workflow execution outside request/response windows.
- Security or policy mandate for hard runtime isolation.

## Related

- Tests: `apps/api/src/app/endpoints/ai/ai.service.spec.ts`
- PR/commit: Pending
- Supersedes: none
