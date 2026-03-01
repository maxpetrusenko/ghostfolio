# Concentration Demo Script (Story-First)

## Demo Story

You are helping a user who is worried they are overexposed to one holding.

User says:

`My portfolio is too concentrated. What should I do?`

Your job in the demo is to show:

1. The system understands the intent
2. The right tools run
3. The output is verified
4. The final answer is clear and actionable

## What To Show On Screen

1. Ask the user question in chat:
   - `My portfolio is too concentrated. What should I do?`
2. Show the normal user-facing answer first:
   - clear summary
   - specific action steps
   - confidence/verification signal
3. Switch to debug view (`debug=1`) for the same prompt:
   - show `facts`
   - show `plan`
   - show `verification`
   - show `final`
4. Return to normal view and close with concrete recommendation.

## What To Say (Short, Human)

Use this flow while showing the screens.

1. Problem framing:
   - `The user asked for concentration help, so the agent should route into portfolio and risk tools, not generic chat output.`
2. Data boundary:
   - `Tools return strict structured data. No freeform wording at the tool layer.`
3. Verification:
   - `Before we answer, we run checks for numerical consistency and plan coherence, then compute confidence.`
4. Rendering:
   - `Only after checks pass do we render a human answer. The renderer explains; it does not invent numbers.`
5. Trust signal:
   - `This gives us auditability and clearer reliability under messy user phrasing.`

## Debug Walkthrough (30-45 Seconds)

Point to these sections quickly:

1. `facts`:
   - top allocation
   - concentration metrics
   - tools used
2. `plan`:
   - target allocations
   - trim/add actions
3. `verification`:
   - checks with pass/warn/fail
   - confidence score
4. `final`:
   - user-friendly explanation built from verified data

## Interview Tradeoff Answers

### Regex / Routing

`Regex is deterministic first-pass routing: fast, cheap, and auditable.`
`Its weakness is phrasing brittleness.`
`We handle uncertainty with verification and controlled fallback, and we can move to embedding-based intent classification when scale justifies it.`

### Why This Pipeline

`Tool output is strict JSON.`
`Verifier checks correctness and confidence.`
`Renderer makes it readable for users without mutating facts.`
`That separation is what makes finance answers defendable.`

### Evals / Reliability

`We evaluate tool selection, forbidden tools, tool-call outcomes, verification checks, citations, and confidence thresholds across happy-path, edge, adversarial, and multi-step cases.`
`We also added typo/paraphrase concentration rows to measure routing robustness directly.`

## 3-Minute Timing

1. 0:00-0:30 -> user question + normal answer
2. 0:30-1:15 -> debug payload (`facts`, `plan`, `verification`, `final`)
3. 1:15-2:15 -> explain architecture split (strict data -> verify -> render)
4. 2:15-3:00 -> tradeoffs + reliability/eval close

## Final Close Line

`This is not a chatbot demo. It is a controlled decision pipeline with clear evidence, verification, and user-readable output.`
