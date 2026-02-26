# Ghostfolio AI Agents Architecture

Last updated: 2026-02-26
Domain: Finance
Primary endpoint: `POST /api/v1/ai/chat`

## Purpose

This document describes the production architecture for Ghostfolio's finance AI agent: tool routing, policy enforcement, execution, verification, response formatting, memory, and observability.

## Runtime Entry Points

- API route/controller: `apps/api/src/app/endpoints/ai/ai.controller.ts`
- Main orchestrator service: `apps/api/src/app/endpoints/ai/ai.service.ts`
- Shared contracts: `apps/api/src/app/endpoints/ai/ai-agent.interfaces.ts`

## Core Agent Components

### 1) Reasoning Engine (LLM Orchestration)

- LLM invocation + provider selection is coordinated in `AiService`.
- Provider adapters and request timeout behavior live in:
  - `apps/api/src/app/endpoints/ai/ai-llm.providers.ts`
- LLM is used selectively for synthesis when deterministic templates are not sufficient.

### 2) Tool Registry and Structured Contracts

- Tool enum and response schemas are defined in:
  - `apps/api/src/app/endpoints/ai/ai-agent.interfaces.ts`
- Tool selection heuristics live in:
  - `apps/api/src/app/endpoints/ai/ai-agent.utils.ts` (`determineToolPlan(...)`)
- Policy gates for safe execution and route decisions live in:
  - `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts` (`applyToolExecutionPolicy(...)`)

### 3) Orchestrator (Multi-Step Execution)

- Main sequence in `AiService.run(...)`:
  1. Resolve session + trace context.
  2. Read memory/state.
  3. Determine tool plan.
  4. Apply policy constraints.
  5. Execute allowed tools.
  6. Add verification checks.
  7. Build deterministic or synthesized response.
  8. Compute confidence.
  9. Persist memory and response cache.
  10. Emit observability snapshot.

### 4) Memory and Context System

- Conversation memory helpers:
  - `apps/api/src/app/endpoints/ai/ai-agent.chat.helpers.ts`
- Persistence backend:
  - `apps/api/src/app/redis-cache/redis-cache.service.ts`
- Context features:
  - turn history reuse
  - follow-up tool reuse when query is context-dependent
  - preference recall/update in session flow

### 5) Verification Layer

- Verification checks are assembled in:
  - `apps/api/src/app/endpoints/ai/ai-agent.verification.helpers.ts`
- Guardrails include:
  - low-confidence abstention behavior
  - policy-route verification metadata
  - tool execution success/failure evidence
  - unsupported/out-of-domain handling

### 6) Output Formatter (Citations + Confidence)

- Response contract includes:
  - `answer`
  - `toolCalls[]`
  - `verification[]`
  - `confidence`
  - `citations[]`
  - `memory`
  - optional `observability`
- Schema source:
  - `apps/api/src/app/endpoints/ai/ai-agent.interfaces.ts`
- Confidence scoring logic:
  - `apps/api/src/app/endpoints/ai/ai-agent.utils.ts` (`calculateConfidence(...)`)

## Deterministic vs LLM Response Strategy

Ghostfolio prioritizes deterministic finance responses for common snapshots and keeps LLM synthesis for complex cross-tool summaries.

Deterministic examples in `ai.service.ts`:

- market snapshot
- portfolio/allocation snapshot
- risk snapshot
- rebalance summary
- stress test summary
- news brief fallback

## Caching and Performance

- Portfolio analysis cache and response cache are maintained in `ai.service.ts`.
- Time-sensitive query bypass pattern is used for terms like `now`, `today`, `latest`, `current`.
- Latency targets are validated by:
  - `apps/api/src/app/endpoints/ai/ai-performance.spec.ts`
  - `apps/api/src/app/endpoints/ai/evals/ai-live-latency.spec.ts`

## Observability and Feedback

- Observability service:
  - `apps/api/src/app/endpoints/ai/ai-observability.service.ts`
- Captures:
  - trace id
  - latency breakdown (memory/tool/llm/total)
  - token estimate
  - verification + confidence summary
- Feedback persistence and events:
  - `apps/api/src/app/endpoints/ai/ai-feedback.service.ts`

## Evaluation Framework

- Primary eval runner:
  - `apps/api/src/app/endpoints/ai/evals/mvp-eval.runner.ts`
- Eval and quality specs:
  - `apps/api/src/app/endpoints/ai/evals/mvp-eval.runner.spec.ts`
  - `apps/api/src/app/endpoints/ai/evals/ai-quality-eval.spec.ts`

## Deployment Surface

- Public API surface is the Ghostfolio API deployment exposing `/api/v1/ai/chat`.
- Local validation runbook and environment details are tracked in:
  - `docs/tasks/tasks.md`

## Requirements Mapping Checklist

- Reasoning engine: Implemented
- Tool registry and orchestration: Implemented
- Memory/context: Implemented
- Multi-step orchestration: Implemented
- Verification layer: Implemented
- Structured formatter with confidence/citations: Implemented
- Eval framework and datasets: Implemented
- Observability + feedback: Implemented

