# Ghostfolio AI Chat Full Demo Script

## Opening

Today I will show Ghostfolio AI chat as a production finance assistant.  
This demo shows one clear story from user question to verified answer.  
You will see tool execution, architecture flow, verification, confidence, observability, and golden eval proof.

## Scene 1: Product Context

Show the chat page.  
This assistant lives inside Ghostfolio backend and uses real portfolio, transaction, and market services.  
This setup gives data-grounded answers that match account context.  
The system focus is reliability, clarity, and safe decision support.

## Scene 2: Main User Story

Type this prompt in chat:  
`My portfolio is too concentrated. What should I do?`  
While the response loads: the orchestrator reads intent and builds a tool plan.  
Open tool details in the response: the plan uses portfolio analysis and risk assessment, plus rebalance planning for action-oriented concentration prompts.  
Point to tool names: each tool call has structured input, structured output summary, status, and timing.

## Scene 3: Read the Answer Like a User

Read the top of the answer out loud.  
The user receives concrete next steps with clear wording.  
The final message is friendly, and the decision path stays transparent through tool and verification metadata.

## Scene 4: Verification and Confidence

Click the small `i` icon on the assistant message header to open response details.  
In the opened panel, read `Confidence`, then `Tools`, then `Verification`.  
The system checks execution quality and response quality before final output.  
Confidence score comes from tool success and verification outcomes.  
Confidence works as a trust signal for financial decisions.

## Scene 5: Architecture in Plain Language

Open `/Users/maxpetrusenko/Desktop/Gauntlet/ghostfolio/docs/ai_agents.md` for ten seconds.  
The flow is memory read, tool planning, policy gating, tool execution, verification, answer assembly, confidence scoring, memory write, and observability capture.  
This separation keeps behavior controllable and audit-friendly.  
Each layer has one job and clear boundaries.

## Scene 6: Multi-Tool Coordination

Return to chat and ask:  
`Analyze portfolio risk, check AAPL quote, then propose rebalance.`  
Open tool details: this is a multi-step chain in one response.  
The system coordinates portfolio context and market context together.  
This is useful for real investor workflows where one question spans several checks.

## Scene 7: Robustness for Messy Input

Run these prompts one by one:  
`analyze my porfolio concentration risk`  
`trim overwaight positions`  
User language varies in real life, so routing includes typo recovery and policy-guided fallback.  
The same reliability path applies every time: tools, checks, confidence, final answer.

## Scene 8: Tradeoffs

Deterministic routing gives speed, cost control, and auditability.  
Language variation adds routing complexity.  
Normalization, policy fallback, verification guards, and eval regressions keep quality stable.  
Embedding-based intent routing can extend language coverage as usage grows.

## Scene 9: Golden Eval Proof

Split screen with terminal and run:  
`npm run test:mvp-eval`  
This is the golden eval gate with fixed prompts and fixed expected behavior.  
Categories cover happy path, edge cases, adversarial prompts, and multi-step flows.  
Typo and paraphrase concentration cases are included in the extended dataset.  
Green result means measurable reliability.

## Scene 10: Observability and Performance

Every request captures trace id, latency breakdown, tool count, verification, confidence, and token estimate.  
Performance targets support production responsiveness for single-tool and multi-step prompts.  
This makes debugging and regression detection fast and practical.

## Closing

Ghostfolio AI chat delivers tool-backed financial answers with visible checks and confidence.  
Users get clear guidance.  
Engineers get observability and eval gates.  
Teams get a system that scales through measurable quality.
