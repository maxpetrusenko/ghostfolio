# Ghostfolio AI Tasks

## Active Tasks

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
| Page | Status |
|------|--------|
| `/chat` | Complete |
| `/portfolio/analysis` | Complete |
| `/portfolio/fire` | Planned |
| Others | Opportunities documented |

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
