# Implementation Plan: Enhanced Tax and Order Query Routing

**Created**: 2026-02-24
**Status**: Draft
**Priority**: Medium

## Problem Statement

Users asking natural language questions about taxes and orders receive inconsistent responses:
1. Tax queries like "what do i need to know this year about taxes" may not trigger appropriate tools
2. Order queries like "make an order for tesla" should ask for details (amount, review) instead of directly executing

## Current State Analysis

### Tax Query Handling
**File**: `apps/api/src/app/endpoints/ai/ai-agent.utils.ts`

- Lines 269-276: `TAX_ESTIMATE_QUERY_PATTERNS` and `TAX_GENERAL_QUERY_PATTERNS`
- `TAX_GENERAL_QUERY_PATTERNS`:
  ```typescript
  const TAX_GENERAL_QUERY_PATTERNS = [
    /\b(?:tax|taxes|taxation|irs)\b/,
    /\b(?:year[-\s]?end|this\s+year)\b.*\b(?:tax|taxes)\b/
  ];
  ```
- Line 807-809: Routes to `tax_estimate` tool
- `tax_estimate` is in READ_ONLY_TOOLS (policy-utils.ts:82)

**Issue**: The first pattern `/\b(?:tax|taxes|taxation|irs)\b/` is too broad and may match unexpected contexts. The second pattern requires "this year" AND "tax" in a specific order.

### Order Query Handling
**File**: `apps/api/src/app/endpoints/ai/ai-agent.utils.ts`

- Lines 315-317: `CREATE_ORDER_QUERY_PATTERNS`:
  ```typescript
  const CREATE_ORDER_QUERY_PATTERNS = [
    /\b(?:create|place|submit)\b.*\border\b/
  ];
  ```
- Line 847-849: Routes to `create_order` tool
- `create_order` is NOT in READ_ONLY_TOOLS (it's a write operation)

**Issue**: "make an order for tesla" does NOT match because "make" is not in the pattern. The pattern only matches "create", "place", or "submit".

**Policy Guard Missing**: `create_order` should require confirmation before execution, similar to how `rebalance_plan` is handled.

## Proposed Solution

### Phase 1: Enhance Tax Query Patterns (ai-agent.utils.ts)

1. Expand `TAX_GENERAL_QUERY_PATTERNS` to catch broader tax-related queries:
   ```typescript
   const TAX_GENERAL_QUERY_PATTERNS = [
     /\b(?:tax|taxes|taxation|irs)\b.*\b(?:need|know|checklist|info|information|guide|help|this year|year[-\s]?end)\b/,
     /\b(?:need|know|checklist|info|information|guide|help|this year|year[-\s]?end)\b.*\b(?:tax|taxes)\b/,
     /\b(?:what do i need to know|tell me about|help me with|guide to)\b.*\b(?:tax|taxes)\b/
   ];
   ```

2. Verify `tax_estimate` tool works correctly for these queries

### Phase 2: Enhance Order Query Detection (ai-agent.utils.ts)

1. Expand `CREATE_ORDER_QUERY_PATTERNS` to include "make" and other verbs:
   ```typescript
   const CREATE_ORDER_QUERY_PATTERNS = [
     /\b(?:create|place|submit|make|execute|put)\b.*\border\b/,
     /\b(?:buy|purchase|invest in)\b.*\b(?:shares?|stock|position)\b/i
   ];
   ```

2. Add new intent detection for vague order requests:
   ```typescript
   const VAGUE_ORDER_INTENT_PATTERNS = [
     /\b(?:make an order|order|buy|purchase)\s+(?:for|of|)?\s*\$?\s*[A-Z]{1,6}\b/i
   ];
   ```

### Phase 3: Add Order Clarification Policy (ai-agent.policy.utils.ts)

1. Add `create_order` to write operations requiring confirmation:
   - Similar to existing `rebalance_plan` guard at lines 541-547
   - If query lacks specific details (amount, order type), route to 'clarify'

2. Add clarification response:
   ```typescript
   if (policyDecision.blockReason === 'needs_order_details') {
     return `To create an order, I need more details:
     - Amount (e.g., "buy 1000 USD of TSLA")
     - Order type (market/limit)

     Or review your portfolio first: "Show my holdings and cash balance"`;
   }
   ```

3. Update `READ_ONLY_TOOLS` to not include `create_order` (already correct)

### Phase 4: Clarification Response Enhancement

Update line 606 clarification message to explicitly mention tax and order options:
```typescript
return `I can help with allocation review, concentration risk, market prices, stress scenarios, and tax planning. Which one should I run next? Example: "Show concentration risk", "Tax checklist for this year", or "Review portfolio before placing order".`;
```

## Implementation Files

| File | Changes |
|------|---------|
| `apps/api/src/app/endpoints/ai/ai-agent.utils.ts` | Phase 1, 2: Pattern updates |
| `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts` | Phase 3: Order clarification policy |
| `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts` | Add tests for new policies |
| `apps/api/src/app/endpoints/ai/ai-agent.utils.spec.ts` | Add tests for new patterns |

## Test Cases

### Tax Queries
| Query | Expected Tool | Notes |
|-------|--------------|-------|
| "what do i need to know this year about taxes" | `tax_estimate` | Should match new pattern |
| "tax checklist" | `tax_estimate` | Should match |
| "help me with my taxes" | `tax_estimate` | Should match |
| "what's the tax rate" | `tax_estimate` | Should match |

### Order Queries
| Query | Expected Response | Notes |
|-------|------------------|-------|
| "make an order for tesla" | Clarification | Needs amount |
| "buy TSLA" | Clarification | Needs amount |
| "buy 1000 USD of TSLA" | `create_order` | Has details |
| "create order" | Clarification | Too vague |

## Success Criteria

1. Tax queries trigger `tax_estimate` tool consistently
2. Order queries without details trigger clarification
3. Order queries with full details proceed to `create_order`
4. All existing tests pass
5. New test cases added and passing

## Related Files

- `apps/api/src/app/endpoints/ai/ai-agent.interfaces.ts` - Tool definitions
- `apps/api/src/app/endpoints/ai/ai.service.ts` - Main service orchestration
- `apps/api/src/app/endpoints/ai/ai-chat.dto.ts` - Request/response DTOs
