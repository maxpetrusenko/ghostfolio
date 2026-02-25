# ADR-003: AI UI surface choice

**Status**: Accepted
**Date**: 2026-02-25
**Context**: Determine the first UI surface for agent interactions and feedback loops.

## Options Considered

### Option A: Reuse existing Ghostfolio chat UI and upgrade it
Use `/api/v1/ai/chat` and current chat components as the primary interaction and evaluation surface.

- Pros
  - Fastest measurable eval loop.
- Cons
  - Must preserve existing chat ergonomics while adding traces and feedback fields.

### Option B: Add new AI Agent panel/page
Add a dedicated page for agent workflows and policy controls.

- Pros
  - Clearer product separation.
- Cons
- Additional UX and navigation latency for initial rollout.

### Option C: Floating global widget
- Pros
  - Broad discoverability.
- Cons
  - Highest UI work and more interaction conflict risk.

## Decision

Use Option A for v1 and instrument it for trace IDs, tool trace display, and feedback collection.

## Trade-offs / Consequences

- Positive: immediate test loop from prompt → response → trace retrieval.
- Negative: AI coverage remains distributed through page-level panels (`analysis`, `fire`, `chat`).

## What Would Change Our Mind

- The chat surface causes unacceptable conversion or retention friction.
- Product requires persistent global presence across non-chat tasks.

## Related

- Tests: `apps/client/src/app/pages/portfolio/analysis/ai-chat-panel/ai-chat-panel.component.spec.ts`, `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.spec.ts`, `npx nx run api:test`
- PR/commit: Pending
- Supersedes: none
