# Chat Context Continuation Fixes

## Date
2025-02-26

## Problems

### 1. "anything else?" triggers wrong fallback
- User sees: "Insufficient confidence to provide a reliable answer from this query alone."
- Expected: Contextual follow-up response or LLM-generated clarification
- Root cause: `followUpSignal?.isLikelyFollowUp ?? isFollowUpQuery(query)` doesn't fall back to `isFollowUpQuery` when signal exists but is false

### 2. "fundamentals on top 5 stock" fails
- Typo: "stock" vs "stocks"
- Pattern matching too strict

### 3. "than?" causes API error
- Incomplete query causes downstream errors

## Fixes

### Fix 1: Improve follow-up detection in `applyToolExecutionPolicy`

**File**: `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`

**Line ~908**: Change from OR fallback to AND check:
```javascript
// BEFORE
const hasFollowUpIntent =
  followUpSignal?.isLikelyFollowUp ?? isFollowUpQuery(query);

// AFTER
const hasFollowUpIntent =
  (followUpSignal?.isLikelyFollowUp || isFollowUpQuery(query));
```

This ensures `isFollowUpQuery` pattern matching is always checked, even if followUpSignal exists.

### Fix 2: Add "stock" (singular) to fundamentals pattern

**File**: `apps/api/src/app/endpoints/ai/ai.service.ts`

Update the fundamentals intent pattern to accept both singular and plural.

### Fix 3: Better handling of incomplete queries

Add validation for extremely short queries (< 3 chars) before processing.

## Testing

1. "anything else?" should return contextual follow-up response
2. "fundamentals on top 5 stock" should work like "stocks"
3. Very short queries like "than?" should return helpful guidance, not error

## Implementation Order

1. Fix the `??` to `||` in policy utils (Fix 1)
2. Test "anything else?" behavior
3. Add fundamentals pattern flexibility (Fix 2)
4. Add min query length validation (Fix 3)
