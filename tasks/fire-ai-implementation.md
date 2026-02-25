# FIRE Page AI Implementation Plan

## Overview
Add AI chat capabilities to the FIRE (Financial Independence, Retire Early) calculator page to provide personalized retirement planning insights, scenario analysis, and natural language interactions.

## Current State

### Existing AI Integration
- `/chat` - Full AI chat interface
- `/portfolio/analysis` - Embedded AI chat panel (`GfAiChatPanelComponent`)

### FIRE Page Structure
- Component: `GfFirePageComponent` at `apps/client/src/app/pages/portfolio/fire/fire-page.component.ts`
- Calculator: `GfFireCalculatorComponent`
- Features:
  - Safe withdrawal rate selection (2.5% - 4.5%)
  - Retirement date input
  - Projected total amount
  - Annual interest rate setting
  - Savings rate configuration

## Implementation Plan

### Phase 1: Frontend AI Chat Panel for FIRE

#### 1.1 Create FIRE-Specific AI Chat Panel
**Location**: `apps/client/src/app/pages/portfolio/fire/ai-chat-panel/`

**Files to create**:
- `gf-fire-ai-chat-panel.component.ts`
- `gf-fire-ai-chat-panel.component.html`
- `gf-fire-ai-chat-panel.component.scss`

**Key features**:
- Reuse `GfAiChatPanelComponent` pattern as base
- FIRE-specific storage keys (separate from analysis chat)
- FIRE-specific starter prompts
- Optional: Pre-populate with FIRE calculator context

**Starter Prompts**:
```typescript
readonly starterPrompts = [
  $localize`Am I on track for early retirement?`,
  $localize`What if I increase my savings rate by 5%?`,
  $localize`How does a market crash affect my FIRE date?`,
  $localize`Explain my safe withdrawal rate options.`
];
```

#### 1.2 Update FIRE Page Component
**File**: `apps/client/src/app/pages/portfolio/fire/fire-page.component.ts`

**Changes**:
- Import `GfFireAiChatPanelComponent`
- Add permission check for `readAiPrompt`
- Pass FIRE calculator context to AI panel (optional enhancement)

#### 1.3 Update FIRE Page Template
**File**: `apps/client/src/app/pages/portfolio/fire/fire-page.html`

**Changes**:
- Add AI chat panel section
- Position below calculator or in collapsible panel

### Phase 2: Backend FIRE-Specific AI Tools

#### 2.1 New AI Tools for FIRE
**Location**: `apps/api/src/app/endpoints/ai/ai-agent.fire-tools.ts` (new file)

**Tools to implement**:

1. **`fire_calculator_analysis`**
   - Input: Current FIRE calculator state
   - Output: Analysis of retirement readiness
   - Context: Current wealth, withdrawal rate, retirement date

2. **`fire_scenario_analysis`**
   - Input: Scenario parameters (savings rate change, return rate change, etc.)
   - Output: Projected FIRE date impact
   - Context: What-if analysis

3. **`withdrawal_strategy_analysis`**
   - Input: Safe withdrawal rate options
   - Output: Comparison of withdrawal strategies
   - Context: 2.5% vs 3% vs 4% trade-offs

4. **`retirement_income_projection`**
   - Input: Portfolio and time horizon
   - Output: Monthly/yearly income projections
   - Context: Retirement spending analysis

#### 2.2 Update AI Service
**File**: `apps/api/src/app/endpoints/ai/ai.service.ts`

**Changes**:
- Import FIRE tools
- Add FIRE tools to tool execution logic
- Add FIRE-specific context gathering

### Phase 3: Integration & Testing

#### 3.1 Update Tool Planning
**File**: `apps/api/src/app/endpoints/ai/ai-agent.utils.ts`

**Changes**:
- Add FIRE-related query detection
- Route FIRE queries to appropriate tools

#### 3.2 Testing Strategy
1. Unit tests for FIRE tools
2. Integration tests for AI + FIRE calculator
3. E2E tests for common user queries

## File Structure Summary

```
apps/client/src/app/pages/portfolio/fire/
├── ai-chat-panel/
│   ├── gf-fire-ai-chat-panel.component.ts
│   ├── gf-fire-ai-chat-panel.component.html
│   └── gf-fire-ai-chat-panel.component.scss
├── fire-page.component.ts (modify)
├── fire-page.component.html (modify)
└── fire-page.scss

apps/api/src/app/endpoints/ai/
├── ai-agent.fire-tools.ts (new)
├── ai.service.ts (modify)
└── ai-agent.utils.ts (modify)
```

## Success Criteria

- [ ] AI chat panel renders on FIRE page
- [ ] Starter prompts trigger relevant FIRE insights
- [ ] AI can access FIRE calculator state
- [ ] Scenario analysis works ("what if I save more?")
- [ ] Withdrawal rate comparisons work
- [ ] Memory persists across sessions
- [ ] Permissions checked correctly
- [ ] All tests pass

## Dependencies

- Existing `GfAiChatPanelComponent` pattern
- AI service infrastructure
- FIRE calculator data structures

## Optional Enhancements

1. **Context Pre-population**: Auto-load FIRE calculator state into AI context
2. **Visual Feedback**: Update calculator when AI suggests scenarios
3. **Export Options**: Save AI-generated retirement plans
4. **Multi-language**: FIRE insights in user's language
