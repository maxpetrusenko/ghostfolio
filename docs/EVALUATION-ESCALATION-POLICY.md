# Evaluation Escalation Policy Alignment

Date: 2026-02-24
Scope: Ghostfolio finance agent eval stack (`apps/api/src/app/endpoints/ai/evals/*`)

## Policy Stages

### 1) Baseline (Golden Set)

Status: Implemented

Evidence:

- Golden set dataset: `apps/api/src/app/endpoints/ai/evals/mvp-eval.dataset.ts`
- Versioned open-source dataset export: `tools/evals/finance-agent-evals/datasets/ghostfolio-finance-agent-evals.v1.json`
- Explicit pass/fail expectations per case:
  - required/forbidden tools
  - expected verification checks
  - expected answer includes/patterns
  - confidence/citation/memory bounds

### 2) Coverage (Labeled Scenarios)

Status: Implemented

Evidence:

- Scenario labels added to eval cases via shared case factory:
  - category (`risk|persona|edge_case|attack|workflow`)
  - difficulty (`straightforward|ambiguous|edge_case`)
  - tool bucket (`portfolio|risk|market|rebalance|stress|multi|none`)
- Coverage matrix utility:
  - `apps/api/src/app/endpoints/ai/evals/mvp-eval.coverage.ts`
- Coverage test:
  - `apps/api/src/app/endpoints/ai/evals/mvp-eval.coverage.spec.ts`
- Matrix report command:
  - `npm run evals:coverage:report`

### 3) Replay Harness

Status: Implemented

Evidence:

- Eval replay execution:
  - `runMvpEvalSuite` / `runMvpEvalCase` in `mvp-eval.runner.ts`
- Captured run metrics:
  - pass/fail
  - failures
  - per-case duration
  - category summaries
  - hallucination-rate
  - verification-accuracy
- Optional LangSmith trace capture for suite and per-case runs.

### 4) Rubrics

Status: Partial (active, lightweight)

Evidence:

- Deterministic quality checks:
  - `response_quality` verification with structure/actionability/evidence checks
  - `apps/api/src/app/endpoints/ai/evals/ai-quality-eval.spec.ts`

Planned lift:

- Add explicit numeric rubric scoring dimensions:
  - accuracy
  - completeness
  - safety
  - clarity

### 5) Experiments (Controlled A/B)

Status: Partial (framework present, dedicated A/B harness pending)

Evidence:

- Existing deterministic eval/replay baseline can score variant outputs.

Planned lift:

- Add controlled A/B runner that compares prompt/model/architecture variants on the same golden set with measured deltas before adoption.

## Current Coverage Snapshot

Command:

```bash
npm run evals:coverage:report
```

Latest output:

- total eval cases: 109
- scenario counts:
  - risk: 39
  - persona: 9
  - edge_case: 26
  - attack: 20
  - workflow: 15
- matrix empty cells are reported explicitly to guide next test authoring.

## Required Gates

```bash
npm run test:ai
npm run test:mvp-eval
npm run test:mvp-eval:coverage
npm run evals:coverage:report
```
