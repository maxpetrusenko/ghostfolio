---
name: ai-chatbot-tool-creation
description: Build or extend Ghostfolio AI chat tools end-to-end (intent routing, policy, execution, tests, evals) and validate behavior through the AI chat API endpoint.
metadata:
  short-description: Ghostfolio AI tool builder
---

# AI Chatbot Tool Creation (Ghostfolio)

Use this skill when adding or modifying AI tools behind `POST /api/v1/ai/chat`.

## Scope

- Backend only:
  - `apps/api/src/app/endpoints/ai/ai-agent.interfaces.ts`
  - `apps/api/src/app/endpoints/ai/ai-agent.utils.ts`
  - `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`
  - `apps/api/src/app/endpoints/ai/ai.service.ts`
- Tests/evals:
  - `apps/api/src/app/endpoints/ai/*.spec.ts`
  - `apps/api/src/app/endpoints/ai/evals/dataset/*.ts`

## Workflow

1. Define or update tool contract in interfaces.
2. Route intent in `determineToolPlan(...)`.
3. Enforce policy (allowlist, confirmation, limits) in `applyToolExecutionPolicy(...)`.
4. Implement tool execution in `ai.service.ts`:
   - structured `toolCall`
   - citations
   - confidence impact
   - verification details
5. Add/adjust tests for planner, policy, and service layers.
6. Add eval dataset entries for regressions.
7. Validate with API call and targeted test commands.

## API Validation

Local endpoint:

- `POST http://localhost:3333/api/v1/ai/chat`

Example:

```bash
curl -sS -X POST "http://localhost:3333/api/v1/ai/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"Am I on track for FIRE?","sessionId":"skill-test-1"}'
```

Expected in response JSON:

- `answer`
- `toolCalls[]`
- `verification[]`
- `confidence`
- `memory.sessionId`

## Done Criteria

- Tool is routable, policy-guarded, and observable.
- AI endpoint returns structured tool execution data.
- Regression tests pass for touched modules.
