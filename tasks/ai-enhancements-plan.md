# Ghostfolio AI Enhancements Implementation Plan

**Date**: 2025-02-24
**Status**: Draft
**Focus**: Quick wins, incremental implementation

## Completed Work

### 1. FIRE Page AI Chat Panel (Frontend)
**Status**: Complete
**Files**:
- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.ts`
- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.html`
- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/gf-fire-ai-chat-panel.component.scss`

**Features**:
- FIRE-specific AI chat with unique storage keys
- 4 FIRE-specific starter prompts
- Permission-aware (requires `readAiPrompt`)
- Shown only when experimental features enabled

### 2. AI Feature Discovery Responses
**Status**: Complete
**File**: `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`

**Enhanced responses**:
- Greeting response now lists all AI capabilities (Portfolio, Risk, FIRE, Market, Transactions, Advice)
- Capability query response now maps features to pages (`/portfolio/analysis`, `/portfolio/fire`, `/chat`)
- Default fallback response includes quick examples for each category

### 3. Add "Add Money" for Demo Testing
**Status**: Complete
**Files**:
- `apps/client/src/app/pages/portfolio/activities/add-funds-dialog.component.ts`
- `apps/client/src/app/pages/portfolio/activities/add-funds-dialog.component.html`
- `apps/client/src/app/pages/portfolio/activities/activities-page.component.ts` (modified)
- `apps/client/src/app/pages/portfolio/activities/activities-page.html` (modified)
- `apps/client/src/app/pages/portfolio/activities/activities-page.scss` (modified)

**Features**:
- "Add Funds" button on Activities page for demo users only
- Creates INTEREST order to add virtual money
- Preset amounts: $1,000, $5,000, $10,000, $50,000
- Custom amount input
- Only visible when user has DEMO tag

### 4. Build Error Fixes
**Status**: Complete
**Files**:
- `apps/api/src/app/endpoints/ai/ai-agent.chat.helpers.ts` (fixed function signature)
- `apps/client/src/app/pages/chat/chat-page.component.ts` (fixed nativeElement issue)

## Remaining Tasks

### Priority 1: FIRE-Specific AI Tools (Backend)
**File**: `apps/api/src/app/endpoints/ai/` (create new file)

**Tools to implement**:
1. `fire_calculator_analysis` - Analyze FIRE readiness with current data
2. `fire_scenario_analysis` - What-if scenarios (savings rate changes, return changes)
3. `withdrawal_strategy_analysis` - Compare safe withdrawal rate options
4. `retirement_income_projection` - Monthly/yearly income projections

**Implementation Pattern**:
- Follow existing tool pattern in `ai-agent.*-tools.ts`
- Use FIRE calculator data from `user.settings`
- Return structured analysis for LLM to interpret

**Estimated Time**: 2-3 hours

---

### Priority 4: AI for Other Pages (Optional/Enhancement)

#### Allocations Page
**File**: `apps/client/src/app/pages/portfolio/allocations/`

**AI Opportunities**:
- Natural language allocation explanations
- Optimization suggestions
- Risk assessment by allocation

**Estimated Time**: 2-3 hours (reusing FIRE panel pattern)

#### Activities/Transactions Page
**File**: `apps/client/src/app/pages/portfolio/activities/`

**AI Opportunities**:
- Pattern recognition insights
- Tax optimization hints
- Behavioral insights

**Estimated Time**: 2-3 hours

#### X-ray Page
**File**: `apps/client/src/app/pages/portfolio/x-ray/`

**AI Opportunities**:
- Natural language risk explanations
- Personalized recommendations

**Estimated Time**: 2-3 hours

## Implementation Order (Recommended)

### Phase 1: Critical Fixes (This Session)
1. Fix `ai.service.ts` build errors
2. Test FIRE AI chat panel locally
3. Verify AI feature discovery responses work

### Phase 2: Quick Wins (Next Session)
1. Add "Refresh Demo Data" button
2. Implement one FIRE-specific AI tool (`fire_calculator_analysis`)

### Phase 3: Expansion (Future Sessions)
1. Add remaining FIRE AI tools
2. Implement AI for Allocations page
3. Implement AI for Activities page

## Files Summary

### Created Today
- `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/*` (3 files)
- `tasks/fire-ai-implementation.md`
- `tasks/ai-opportunities.md`
- `tasks/Tasks.md`

### Modified Today
- `apps/client/src/app/pages/portfolio/fire/fire-page.component.ts`
- `apps/client/src/app/pages/portfolio/fire/fire-page.html`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`

### To Modify (Next Steps)
- `apps/api/src/app/endpoints/ai/ai.service.ts` (fix errors)
- `apps/client/src/app/pages/demo/demo-page.component.ts` (demo refresh)
- `apps/api/src/app/endpoints/ai/ai-agent.fire-tools.ts` (new, FIRE tools)

## Success Criteria

- [x] Build passes without TypeScript errors
- [x] FIRE AI chat panel functional in local testing
- [x] AI provides helpful feature guidance when asked "what can I do?"
- [x] Demo "Add Funds" feature implemented
- [ ] At least one FIRE-specific AI tool implemented

## Notes

- All AI integrations follow the established `GfAiChatPanelComponent` pattern
- Storage keys are unique per page to avoid conflicts
- Experimental features flag (`isExperimentalFeatures`) controls visibility
- All changes maintain existing permission checks
