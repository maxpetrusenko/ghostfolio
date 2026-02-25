# ADR-004: Auth and tenancy model for AI agent requests

**Status**: Accepted
**Date**: 2026-02-25
**Context**: Ensure every AI request is auditable, scoped, and safe in a multi-tenant environment.

## Options Considered

### Option A: JWT/session scope enforced at controller with explicit hard-fail for missing identity
Every request carries `accountId`/`userId` and rejects missing identity as hard error.

- Pros
  - Clear tenancy boundary and auditability.
- Cons
  - Existing unauthenticated call sites need guardrails.

### Option B: Soft fallback for missing identity
Attempt best-effort execution with defaults when user context is missing.

- Pros
  - Faster to unblock local development.
- Cons
  - Data leakage and ownership ambiguity risk.

## Decision

Use Option A and require authenticated session-scoped identity in request pipeline.

## Trade-offs / Consequences

- Positive: no ambiguous ownership for tool execution, memory writes, and feedback.
- Negative: stricter validation paths require test updates and integration checks.

## What Would Change Our Mind

- A hard isolation boundary requires trusted edge token exchange and no direct anonymous access.
- If policy introduces guest mode, add explicit, separate anonymous plan path with restricted toolset.

## Related

- Tests: `apps/api/src/app/endpoints/ai/ai.controller.spec.ts` (if available), `apps/api/src/app/endpoints/ai/ai.service.spec.ts`, `apps/api/src/app/endpoints/ai/ai-observability.service.spec.ts`
- PR/commit: Pending
- Supersedes: none
