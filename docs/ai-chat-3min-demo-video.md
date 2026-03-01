# AI Chat Demo Video (3 Minutes)

## Goal

Show a production-ready finance AI agent with:

1. Natural language understanding
2. Multi-tool execution
3. Verification and confidence
4. Observability and eval discipline
5. Clear architecture and tradeoff logic

## What To Prepare Before Recording

1. Open chat page and keep terminal ready for test output.
2. Keep one tab with architecture file:
   - `docs/ai_agents.md`
3. Keep one tab with eval references:
   - `apps/api/src/app/endpoints/ai/evals/dataset/happy-path.dataset.ts`
   - `apps/api/src/app/endpoints/ai/evals/dataset/extended.dataset.ts`
4. Keep one tab with this script.

## 3-Minute Storyboard

### 0:00 - 0:25 | User Problem

On screen:

- AI chat input: `My portfolio is too concentrated. What should I do?`

Say:

`This is a real user problem. The agent routes this into portfolio and risk workflows, then returns concrete actions with verification and confidence.`

### 0:25 - 1:10 | Tools In Action

On screen:

- Show response details with tool calls
- Highlight tools used

Say:

`The agent uses domain tools instead of freeform guessing.`
`In this path it runs portfolio analysis, risk assessment, and rebalance planning when action intent is present.`
`Each tool call returns structured output and execution status.`

### 1:10 - 1:45 | Verification + Confidence

On screen:

- Show `verification[]`
- Show `confidence`

Say:

`Every answer passes through verification checks before final output.`
`Checks validate tool execution and response quality signals.`
`Confidence scoring combines tool success and verification outcomes so reliability is explicit.`

### 1:45 - 2:20 | Architecture Snapshot

On screen:

- Open `docs/ai_agents.md`
- Point to orchestrator sequence and component list

Say:

`Architecture uses a clear pipeline: intent planning, policy gating, tool execution, verification, response assembly, memory persistence, and observability.`
`This separation keeps behavior controllable and audit-ready in a finance context.`

### 2:20 - 2:45 | Tradeoff Logic

On screen:

- Return to chat response and tool details

Say:

`Routing starts with deterministic regex and token heuristics because speed, cost, and auditability matter.`
`Typo and paraphrase robustness is covered with normalization plus regression tests.`
`When ambiguity appears, policy and verification paths steer to clarify or abstain behavior with explicit confidence.`

### 2:45 - 3:00 | Evals + Performance Close

On screen:

- Show terminal results:
  - `npm run test:ai`
  - `npm run test:mvp-eval`
- Mention latency targets from perf tests

Say:

`Quality is measured continuously with happy-path, edge, adversarial, and multi-step evals.`
`Current suite passes, and latency targets stay within production thresholds for single-tool and multi-step flows.`
`This is a reliable AI system for financial workflows, ready for iterative scale.`

## Demo Prompts To Use

Use these in order:

1. `My portfolio is too concentrated. What should I do?`
2. `porftolio too consentrated`
3. `too much in one stock`
4. `trim overwaight positions`
5. `wats my risk`

These match newly added typo/paraphrase eval rows in:

- `apps/api/src/app/endpoints/ai/evals/dataset/extended.dataset.ts`

## Requirement Mapping (Highest-Value Points)

From `docs/requirements.md`, emphasize these as spoken checkpoints:

1. Tooling: 5+ functional tools with structured outputs
2. Verification: 3+ domain checks with confidence
3. Evaluation: 50+ cases across happy/edge/adversarial/multi-step
4. Observability: traces, latency, token estimates, failures
5. Performance: single-tool and multi-step latency targets
6. Reliability: low hallucination rate, high verification accuracy

## Short Q&A Lines

Use these exact lines in interview discussion:

1. `Decision: deterministic planner plus policy gates. Reason: controllability and auditability in finance.`
2. `Decision: structured tool outputs with verification-first response assembly. Reason: factual consistency under noisy prompts.`
3. `Decision: eval-first iteration loop. Reason: measurable reliability and fast regression detection.`

## Finish Line

Final line to camera:

`This demo shows an AI chat product that combines user-friendly answers with production control systems: tools, policy, verification, observability, and eval discipline.`
