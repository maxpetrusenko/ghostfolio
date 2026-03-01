# ADR: Follow-Up Governance and Rollback Safety (Phase 1)

## Status

Accepted - 2026-02-26

## Context

Follow-up routing quality improved with multi-signal scoring, but three production risks remained:

1. Thresholds were hardcoded inside resolver logic, making tuning opaque.
2. Short follow-up detection logic was duplicated between policy and service layers.
3. Rollback path for follow-up logic changes was not explicit at runtime.

## Decision

1. Centralize follow-up thresholds in exported constants (`FOLLOW_UP_SIGNAL_THRESHOLDS`).
2. Unify short-context follow-up matching in policy utils (`isShortContextFollowUpQuery`) and reuse in service.
3. Keep follow-up resolver always-on with the signal-based path.
4. Emit structured follow-up decision telemetry (scores, source mode, thresholds) in observability snapshots.
5. Add a deterministic baseline script (`tools/evals/follow-up-baseline.ts`) to track precision/recall deltas.

## Consequences

### Positive

- Follow-up tuning now has a single source of truth.
- Drift risk between policy/service follow-up paths is reduced.
- Rollback can be done via environment config without redeploying code.
- Follow-up behavior is observable and can be compared across releases.

### Tradeoffs

- Slightly larger observability payload due to follow-up metadata.
- Baseline script is currently deterministic and should be expanded with real production samples.

## Related Files

- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`
- `apps/api/src/app/endpoints/ai/ai.service.ts`
- `apps/api/src/app/endpoints/ai/ai-observability.service.ts`
- `apps/api/src/services/configuration/configuration.service.ts`
- `apps/api/src/services/interfaces/environment.interface.ts`
- `tools/evals/follow-up-baseline.ts`
