# ADR-002: Agent integration seam (AgentKernel + ToolRegistry)

**Status**: Accepted
**Date**: 2026-02-25
**Context**: Avoid locking architecture to one runtime shape by isolating AI execution behind a narrow interface.

## Options Considered

### Option A: AgentKernel interface inside Ghostfolio (recommended)
Define `AgentKernel.run(request) -> AgentResponse` and keep all tools behind a `ToolRegistry`.

- Pros
  - Stable seam for migration from embedded runtime to sidecar.
- Cons
  - One-time refactor of the current service path.

### Option B: Inline service paths with direct tool calls
Keep current AI service logic directly tied to Ghostfolio API modules and tool selection flow.

- Pros
  - Lowest immediate rewrite overhead.
- Cons
  - Coupled architecture; sidecar migration becomes a redesign instead of packaging change.

## Decision

Use Option A and implement `AgentKernel` + `ToolRegistry` in `apps/api/src/app/endpoints/ai` as transport-agnostic boundary.

## Trade-offs / Consequences

- Positive: migration path to sidecar is controlled by transport adapter rather than tool rewrite.
- Negative: initial interface split is mandatory before adding more workflows.

## What Would Change Our Mind

- Clear evidence that refactor overhead exceeds benefit and no sidecar migration path is needed.
- Tool layer remains small and stable for full product cycle with no packaging changes planned.

## Related

- Tests: `apps/api/src/app/endpoints/ai/ai.service.spec.ts`, `apps/api/src/app/endpoints/ai/ai-agent.utils.spec.ts`
- PR/commit: Pending
- Supersedes: none
