# ADR: Eval State Grounding for Broker Workflow Reliability

## Context

- Bounty evals for broker-statement workflows used subsequence-based tool plan checks, which allowed invalid early calls to pass.
- `resultAssertions` were derived from verification check text, which allowed wording-only passes without proving state transitions.
- Reliability scoring requires deterministic evidence tied to executed tools and backend state, not generated prose.

## Options Considered

- Option A: Keep verification-string parsing and add stricter regex patterns.
- Option B: Add strict tool-plan ordering and read assertions from structured tool state payloads.

## Decision

Choose Option B.

- Enforce strict ordered tool-plan checks where any planned tool executed out of sequence fails the case.
- Evaluate `resultAssertions` using structured `toolCalls[].state` values emitted by broker tools from database-backed records.

## Trade-offs / Consequences

- Positive: closes sequence/text spoofing gaps and aligns eval pass criteria with actual state evidence.
- Positive: makes broker-state assertions deterministic and auditable.
- Cost: requires broker tool calls to emit lightweight state payload fields.
- Cost: eval mocks/tests require structured state fixtures instead of verification text scaffolding.

## What Would Change Our Mind

- If all tool executions moved to a centralized typed event ledger with authoritative state snapshots, eval assertions should read from that ledger directly and this tool-call state path should be deprecated.
