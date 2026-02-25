# Tasks

Last updated: 2026-02-24

## Active Tickets

| ID | Feature | Status | Tests | PR / Commit |
| --- | --- | --- | --- | --- |
| T-001 | Presearch package and architecture direction | Complete | Doc review checklist | Local docs update |
| T-002 | ADR foundation in `docs/adr/` | Complete | ADR template and first ADR review | Local docs update |
| T-003 | Agent MVP tool 1: `portfolio_analysis` | Complete | `apps/api/src/app/endpoints/ai/ai.service.spec.ts` | Planned |
| T-004 | Agent memory and response formatter | Complete | `apps/api/src/app/endpoints/ai/ai.service.spec.ts` | Planned |
| T-005 | Eval dataset baseline (MVP 5-10) | Complete | `apps/api/src/app/endpoints/ai/evals/mvp-eval.runner.spec.ts` | Planned |
| T-006 | Full eval dataset (50+) | Complete | `apps/api/src/app/endpoints/ai/evals/mvp-eval.runner.spec.ts` | Local implementation |
| T-007 | Observability wiring (LangSmith traces and metrics) | Complete | `apps/api/src/app/endpoints/ai/ai.service.spec.ts`, `apps/api/src/app/endpoints/ai/ai-feedback.service.spec.ts`, `apps/api/src/app/endpoints/ai/evals/mvp-eval.runner.spec.ts` | Local implementation |
| T-008 | Deployment and submission bundle | Complete | `npm run test:ai` + Railway healthcheck + submission docs checklist | `2b6506de8` |
| T-009 | Open source eval framework contribution | In Review | `@ghostfolio/finance-agent-evals` package scaffold + dataset export + smoke/pack checks | openai/evals PR #1625 + langchain PR #35421 |

## Notes

- Canonical project requirements live in `docs/requirements.md`.
- Architecture decisions live in `docs/adr/`.
- Root tracker mirror lives in `Tasks.md`.
- Requirement closure (2026-02-24): 53-case eval suite and LangSmith tracing integrated in AI chat + eval runner.
- Performance gate (2026-02-24): `npm run test:ai:performance` added for single-tool and multi-step latency regression checks.
- Live latency gate (2026-02-24): `npm run test:ai:live-latency:strict` passing with p95 ~3.5s for single-tool and multi-step prompts.
- Reply quality gate (2026-02-24): `npm run test:ai:quality` added with deterministic anti-disclaimer and actionability checks.
- Eval quality metrics (2026-02-24): hallucination-rate (`<=5%`) and verification-accuracy (`>=90%`) tracked and asserted in MVP eval suite.
- Open-source package scaffold (2026-02-24): `tools/evals/finance-agent-evals/` with dataset export, runner, smoke test, and pack dry-run.
- Condensed architecture doc (2026-02-24): `docs/ARCHITECTURE-CONDENSED.md`.

## MVP Local Runbook

1. Install dependencies and infra:
   - `npm install`
   - `cp .env.dev .env`
   - `docker compose -f docker/docker-compose.dev.yml up -d`
   - `npm run database:setup`
2. Start API:
   - `npm run start:server`
3. Authenticate and call AI chat endpoint:
   - Obtain Bearer token using the existing Ghostfolio auth flow.
   - Call `POST http://localhost:3333/api/v1/ai/chat` with JSON body:
     - `{"query":"Analyze my portfolio concentration risk","sessionId":"mvp-session-1"}`
4. Optional LLM output:
   - Preferred for MVP: set `z_ai_glm_api_key` (`glm-5`) and `minimax_api_key` (`MiniMax-M2.5`) in `.env`.
   - Fallback path: `API_KEY_OPENROUTER` and `OPENROUTER_MODEL` in properties store.
   - Without provider keys, endpoint returns deterministic fallback summaries and still keeps tool and verification metadata.
5. Hostinger infra check:
   - `npm run hostinger:check`

## Verification Snapshot (2026-02-23)

- `nx run api:lint` passed.
- Full `nx test api` fails in existing portfolio calculator tests unrelated to AI endpoint changes.
- Focused AI endpoint test command passed:
  - `npm run test:ai`
  - `npm run test:mvp-eval`


# Ghostfolio AI Tasks

## Active Tasks

### AI Reliability Guardrails: No Portfolio Fallback on Low Confidence

**Status**: Implemented (Pending Push/Deploy) | **Priority**: High

Tasks:

- [x] Replace ambiguous direct/clarify fallback copy with uncertainty-first responses
- [x] Add low-confidence abstain guard in AI chat response assembly when no reliable tool evidence exists
- [x] Adjust confidence scoring so no-tool responses stay in low-confidence band
- [x] Add regression tests for unsupported direct queries and low-confidence behavior
- [x] Run targeted AI test suite for touched files

Success Criteria:

- Unsupported or ambiguous prompts do not default to portfolio recommendations
- Low-confidence responses explicitly abstain and request clarifying context
- No-tool responses do not score as medium/high confidence
- Updated policy/utility/service tests pass

**Key Files**:

- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.utils.ts`
- `apps/api/src/app/endpoints/ai/ai.service.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai.service.spec.ts`
- `tasks/tasks.md`

### Portfolio Chat Page UI Pass: Bottom-Anchored Composer Layout

**Status**: Implemented (Pending Browser Verification) | **Priority**: High

Tasks:

- [x] Audit `/portfolio/chat` route and verify active component/template path
- [x] Replace centered card layout with shell layout (`sidebar + transcript + bottom composer`)
- [x] Tune responsive behavior for desktop/mobile and preserve existing chat features
- [x] Run targeted frontend checks and verify no template/style regressions

Success Criteria:

- `/portfolio/chat` renders transcript in main pane with scrolling messages
- Composer remains pinned at the bottom of the chat pane
- Starter prompts appear near composer, not at the top
- Existing chat actions (new chat, rename, delete, send, feedback, details) continue working

**Key Files**:

- `apps/client/src/app/pages/chat/chat-page.component.html`
- `apps/client/src/app/pages/chat/chat-page.component.scss`
- `tasks/tasks.md`

### Chat UX Refactor: Queue, Responsiveness, and Visual Upgrade

**Status**: Implemented (Pending Push/Deploy) | **Priority**: High

Tasks:

- [x] Fix multi-message flow by adding queued sequential submission (no dropped rapid prompts)
- [x] Replace reverse-order/top-scroll behavior with natural chronological flow and bottom pinning
- [x] Improve composer ergonomics and inline status feedback (queued/sending)
- [x] Refresh message card styling and spacing for readability on desktop/mobile
- [x] Reduce perceived latency with optimistic queue handling and clear progress states
- [x] Run targeted verification (frontend build + affected API tests)

Success Criteria:

- Multiple rapid prompts are accepted and processed in order
- Chat remains anchored to newest message while reading naturally top-to-bottom
- UI density, spacing, and visual hierarchy are improved
- No regression in existing chat submission behavior

**Key Files**:

- `apps/client/src/app/pages/chat/chat-page.component.ts`
- `apps/client/src/app/pages/chat/chat-page.component.html`
- `apps/client/src/app/pages/chat/chat-page.component.scss`
- `tasks/tasks.md`

### Intent Routing and Safe Order Clarification Fix

**Status**: Implemented (Pending Push/Deploy) | **Priority**: High

Tasks:

- [x] Expand order intent detection to cover natural phrasing like `make an order for tesla`
- [x] Ensure action-policy gating keeps blocked action tools on `clarify` route, not `direct`
- [x] Require explicit order fields (symbol, quantity, unit price) before order creation
- [x] Return explicit clarification prompt when order details are missing
- [x] Add regression tests for taxes and order prompts across planner/policy/service
- [x] Extend eval dataset with tax and order-intent regression cases
- [x] Run targeted AI tests and record results

Success Criteria:

- `what do i need to know this year about taxes` triggers `tax_estimate`
- `make an order for tesla` maps to order intent and returns clarification for missing quantity/price
- Blocked action-tool flows return `clarify` response
- Updated tests pass for touched modules

**Key Files**:

- `apps/api/src/app/endpoints/ai/ai-agent.utils.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`
- `apps/api/src/app/endpoints/ai/ai.service.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai.service.spec.ts`
- `apps/api/src/app/endpoints/ai/evals/dataset/happy-path.dataset.ts`

### NVIDIA Intent Routing Fix (Market Context First)

**Status**: Implemented (Pending Push/Deploy) | **Priority**: High

Tasks:

- [x] Reproduce current misroute where NVIDIA investment query returns portfolio risk snapshot
- [x] Update intent/tool routing so `invest in <ticker/company>` prioritizes market context tools (`market_data`, `asset_fundamentals`, `financial_news`, optional `price_history`) before portfolio risk tools
- [x] Add deterministic regression tests for:
  - [x] `should i invest in nvidia` routes to market context tools, not `portfolio_analysis`
  - [x] `tell me about nvidia performance` routes to quote + historical-performance context
  - [x] direct portfolio intent still routes to `portfolio_analysis`
- [x] Run targeted AI endpoint tests and confirm pass

Success Criteria:

- Query `should i invest in nvidia` no longer triggers concentration/risk-only response by default
- Response contains ticker-focused analysis with live context (price/news/fundamentals) and clear caveats
- No regression in existing portfolio/risk queries

**Key Files**:

- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.utils.ts`
- `apps/api/src/app/endpoints/ai/ai.service.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai.service.spec.ts`

### AI Tooling Expansion and Feedback UX

**Status**: Implemented (Pending Verification) | **Priority**: High

Tasks:

- [x] Wire new AI tools in planner/policy/executor (`account_overview`, `exchange_rate`, `price_history`, `symbol_lookup`, `market_benchmarks`, `activity_history`, `demo_data`, `create_account`, `create_order`)
- [x] Add OpenAI fallback coverage and keep minimax fallback path intact
- [x] Fix tax-estimation parser edge case when tax rate is present without deductions
- [x] Add tests for each new tool category across planner/policy/service layers
- [x] Extend AI response details panel with answer + tool input/output
- [x] Add optional feedback comments to chat, analysis panel, and FIRE panel

**Key Files**:

- `apps/api/src/app/endpoints/ai/ai.service.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.utils.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`
- `apps/api/src/app/endpoints/ai/ai.service.spec.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts`
- `apps/client/src/app/pages/chat/chat-page.component.ts`
- `apps/client/src/app/pages/chat/chat-page.component.html`
- `apps/client/src/app/pages/portfolio/analysis/ai-chat-panel/ai-chat-panel.component.ts`
- `apps/client/src/app/pages/portfolio/analysis/ai-chat-panel/ai-chat-panel.component.html`
- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.ts`
- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.html`

### Follow-up Routing and Natural Reply Coherence

**Status**: Implemented (Pending Deploy) | **Priority**: High

Tasks:

- [x] Add explicit follow-up intent detection for short contextual queries
- [x] Reuse previous successful tool set for follow-up turns when current query lacks explicit tool intent
- [x] Replace generic fallback wall for follow-up-without-context with targeted clarification prompt
- [x] Add regression tests for follow-up reuse and follow-up clarification flows
- [x] Run targeted AI suites and confirm no regression

**Key Files**:

- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`
- `apps/api/src/app/endpoints/ai/ai.service.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.chat.helpers.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai.service.spec.ts`

### FIRE Page AI Implementation

**Status**: Planning Complete | **Priority**: High | **Files**: `tasks/fire-ai-implementation.md`

Tasks:

- [ ] Create `GfFireAiChatPanelComponent` (extend existing pattern)
- [ ] Add FIRE-specific AI tools (scenario analysis, withdrawal strategies)
- [ ] Integrate chat panel into FIRE page
- [ ] Add FIRE starter prompts
- [ ] Test end-to-end

**Key Files**:

- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/` (new)
- `apps/api/src/app/endpoints/ai/ai-agent.fire-tools.ts` (new)
- `apps/client/src/app/pages/portfolio/fire/fire-page.component.ts` (modify)

## Research Complete

### AI Integration Analysis

**File**: `tasks/ai-opportunities.md`

Pages evaluated for AI integration. High priority: FIRE, Allocations, Activities, X-ray.

### Current AI Integration

| Page                  | Status                   |
| --------------------- | ------------------------ |
| `/chat`               | Complete                 |
| `/portfolio/analysis` | Complete                 |
| `/portfolio/fire`     | Planned                  |
| Others                | Opportunities documented |

## Completed

- [x] Research codebase for AI integration points
- [x] Document all pages and AI potential
- [x] Create FIRE implementation plan
- [x] Identify reusability patterns (GfAiChatPanelComponent)

## References

- AI Chat Panel: `apps/client/src/app/pages/portfolio/analysis/ai-chat-panel/`
- AI Service: `apps/api/src/app/endpoints/ai/ai.service.ts`
- FIRE Page: `apps/client/src/app/pages/portfolio/fire/`

## Recently Completed (2025-02-24)

### FIRE Page AI Chat Panel Implementation

**Status**: Frontend Complete | **Ready for Testing**

Created files:

- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.ts`
- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.html`
- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.scss`

### Logged-In Seed Funds Flow

**Status**: Completed | **Priority**: High

Tasks:

- [x] Remove demo-only restriction from seed-fund dialog and activity page entry point
- [x] Post seed-funds as account-updating change orders with explicit account targeting
- [x] Update seed-fund copy from demo language to generic testing language
- [x] Add/update component tests for non-demo user seed funding behavior
- [x] Run lint/build verification for touched client surfaces

Success Criteria:

- Non-demo accounts can open seed-funds flow from Activities
- Seed order persists and updates the account balance
- Order payload includes `GF_SEED_*` symbol, `updateAccountBalance: true`, and no demo-only tagging
- Activity page shows “Seed Funds” action without demo checks
- Targeted tests and client verification complete

**Key Files**:

- `apps/client/src/app/pages/portfolio/activities/activities-page.component.ts`
- `apps/client/src/app/pages/portfolio/activities/activities-page.html`
- `apps/client/src/app/pages/portfolio/activities/add-funds-dialog.component.ts`
- `apps/client/src/app/pages/portfolio/activities/add-funds-dialog.component.html`

Modified files:

- `apps/client/src/app/pages/portfolio/fire/fire-page.component.ts` - Added AI panel integration
- `apps/client/src/app/pages/portfolio/fire/fire-page.html` - Added AI chat section

**Features**:

- FIRE-specific AI chat with unique storage keys (separate from analysis chat)
- FIRE starter prompts:
  - "Am I on track for early retirement?"
  - "What if I increase my savings rate by 5%?"
  - "How does a market crash affect my FIRE date?"
  - "Explain my safe withdrawal rate options."
- Permission-aware (requires `readAiPrompt`)
- Shown only when experimental features enabled
- Reuses existing AI service endpoints

**Build Status**: Passing

### Next Steps

- [ ] Test AI chat panel on FIRE page locally
- [ ] Add FIRE-specific backend tools (optional enhancement)
- [ ] Consider adding FIRE calculator context to AI queries
