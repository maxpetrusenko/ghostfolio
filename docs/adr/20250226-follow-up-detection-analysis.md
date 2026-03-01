# Follow-Up Detection Analysis

## Problem Summary

User queries that are clearly follow-ups to previous conversation turns return "Insufficient confidence" instead of using conversation context.

**Example**: After discussing FIRE with 4% withdrawal, user asks `"what if we change percentage to 6%"` and gets:
```
Insufficient confidence to provide a reliable answer from this query alone.
Provide one concrete request so I can run the right checks safely.
```

## Current Detection Mechanisms

### 1. Pattern-Based Detection (`ai-agent.policy.utils.ts`)

```typescript
const FOLLOW_UP_TOKEN_LIMIT = 6;  // Very strict!

const FOLLOW_UP_STANDALONE_QUERY_PATTERNS = [
  /^\s*(?:why|how|how so|and|then|so|anything else|what else|else)(?:\s+(?:now|today|latest|current|updated|update))?\s*[!.?]*\s*$/i
];

const FOLLOW_UP_CONTEXTUAL_QUERY_PATTERNS = [
  /^\s*(?:what about(?:\s+(?:that|this|it))?|why(?:\s+(?:that|this|it))?|how(?:\s+(?:that|this|it|about\s+that))?|can you explain(?:\s+(?:that|this|it))?|explain(?:\s+(?:that|this|it))?)(?:\s+(?:now|today|latest|current|updated|update))?\s*[!.?]*\s*$/i,
  /^\s*(?:should|can|could|would)\s+i(?:\s+\w+){0,3}\s+(?:that|this|it|those|these)\s*[!.?]*\s*$/i
];
```

**Issues**:
- 6 token limit is too restrictive
- "what if" not covered
- No pattern for modifications/changes
- No pattern for hypothetical scenarios

### 2. Signal-Based Detection (`resolveFollowUpSignal()`)

Uses three confidence scores:
- `contextDependencyConfidence` - does this need prior context?
- `standaloneIntentConfidence` - can this stand alone?
- `topicContinuityConfidence` - is this the same topic?

Follow-up is detected when:
```typescript
contextDependencyConfidence >= 0.55 &&
topicContinuityConfidence >= 0.35 &&
standaloneIntentConfidence < 0.75
```

**Issues**:
- Token count penalty: queries >6 tokens get lower contextDependency
- "what if we change percentage to 6%" = 10 tokens → fails pattern match AND loses points

### 3. Additional Checks in `ai.service.ts`

```typescript
function isShortContextFollowUpQuery(query: string) {
  if (normalizedTokens.length > 4) return false;  // Only 4 tokens!
  // ... checks for 'why', 'how', 'what', 'explain', etc.
}
```

## Edge Cases That Fail Detection

| Query | Why It Fails | Token Count |
|-------|-------------|-------------|
| "what if we change percentage to 6%" | No pattern match, >6 tokens | 10 |
| "suppose we increase to 7%" | "suppose" not recognized, >6 tokens | 6 |
| "and with 6% instead" | "and" pattern requires ending with it | 5 |
| "change that to 5%" | "change" not in patterns | 4 |
| "what about 6 percent" | Pattern requires ending | 4 |
| "try 6% instead" | Not covered | 3 |
| "use a different rate" | Too generic, >6 tokens | 5 |
| "can we do 5%" | "can we" not recognized as follow-up | 4 |
| "how about 6 percent" | "how about" not in patterns | 4 |
| "what if i retire early" | "what if" not covered | 5 |
| "assuming 6 percent" | >6 tokens, no pattern | 3 |
| "with a 6% rate" | No follow-up signal words | 4 |
| "at 6% instead" | No demonstrative + no pattern match | 3 |
| "make it 6 percent" | "make it" not recognized | 4 |
| "the 6% scenario" | No follow-up signal | 3 |
| "for 6% withdrawal" | No context dependency signal | 3 |

## Common Follow-Up Patterns Not Covered

### Hypotheticals
- "what if X"
- "suppose X"
- "assuming X"
- "imagine X"
- "let's say X"

### Modifications
- "change X to Y"
- "use X instead"
- "make it X"
- "with X instead of Y"
- "replace with X"

### Continuations with Numbers/Values
- "and with X%"
- "at X rate"
- "for X amount"
- "using X value"

### Scenario Variations
- "the X scenario"
- "X version"
- "X case"

## Two Approaches to Fix

### Option A: Expand Patterns (Band-aid)

Add more regex patterns:
```typescript
const HYPOTHETICAL_PATTERNS = [
  /^\s*what if\b/i,
  /^\s*suppose\b/i,
  /^\s*assuming\b/i,
  /^\s*imagine\b/i
];

const MODIFICATION_PATTERNS = [
  /\bchange\s+.+\s+to\b/i,
  /\binstead\b/i,
  /\buse\s+.+\s+instead\b/i
];

// Increase token limits
const FOLLOW_UP_TOKEN_LIMIT = 12; // was 6
```

**Pros**: Simple, minimal changes
**Cons**: Still pattern-based, will miss edge cases

### Option B: Semantic Follow-Up Detection (Robust)

Replace rigid patterns with a scoring system that considers:

1. **Context Window**: Has conversation happened in last 45 min?
2. **Demonstrative References**: "that", "this", "it", "those"
3. **Implicit References**: Verbs like "change", "use", "make" + value
4. **Numeric Continuity**: Query has number but no finance keywords
5. **Short Query Length**: <=10 tokens
6. **No Explicit Action**: "show", "analyze", "get" NOT present

```typescript
function resolveFollowUpSemantic({
  query,
  previousTurn,
  hasRecentContext
}: {
  query: string;
  previousTurn?: AiAgentFollowUpResolverPreviousTurn;
  hasRecentContext: boolean;
}): AiAgentFollowUpSignal {
  const normalizedQuery = query.trim().toLowerCase();
  const tokens = tokenizeQuery(normalizedQuery);

  let followUpScore = 0;

  // 1. Demonstrative references (strongest signal)
  if (/\b(?:that|this|it|those|these)\b/.test(normalizedQuery)) {
    followUpScore += 0.4;
  }

  // 2. Hypothetical markers
  if (/^\s*(?:what if|suppose|assuming|imagine|let's say)\b/i.test(normalizedQuery)) {
    followUpScore += 0.5;
  }

  // 3. Modification verbs without explicit action
  if (/\b(?:change|use|make|try|with|at)\b/i.test(normalizedQuery) &&
      !isClearlyNewRequestQuery(normalizedQuery)) {
    followUpScore += 0.3;
  }

  // 4. Short query with number but no finance keywords
  const hasNumber = /\d+%?/.test(normalizedQuery);
  const hasFinanceKeyword = FINANCE_READ_INTENT_KEYWORDS.some(k => normalizedQuery.includes(k));
  if (hasNumber && !hasFinanceKeyword && tokens.length <= 10) {
    followUpScore += 0.35;
  }

  // 5. Recent conversation context
  if (hasRecentContext) {
    followUpScore += 0.2;
  }

  // 6. Token count favor (shorter = more likely follow-up)
  if (tokens.length <= 8) {
    followUpScore += 0.15;
  }

  // 7. Topic continuity from previous turn
  if (previousTurn) {
    const topicOverlap = calculateTokenOverlap(tokens, tokenizeQuery(previousTurn.query));
    followUpScore += topicOverlap * 0.3;
  }

  return {
    isLikelyFollowUp: followUpScore >= 0.5,
    confidence: followUpScore
  };
}
```

## Recommendation

**Option B** - Semantic scoring is more robust and handles future edge cases.

Key changes needed:
1. Remove `FOLLOW_UP_TOKEN_LIMIT` or increase to 12
2. Add "what if" and other hypothetical patterns
3. Modify scoring in `resolveFollowUpSignal()`:
   - Penalize less for longer queries with values
   - Add bonus for numeric values without finance keywords
   - Recognize "change/use/make" + value as follow-up signal
4. Keep pattern fallback but make it permissive

## Files to Modify

1. `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`
   - Lines 98-105: Patterns and token limit
   - Lines 298-423: `resolveFollowUpSignal()` function

2. `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts`
   - Add tests for new follow-up patterns

3. `apps/api/src/app/endpoints/ai/ai.service.ts`
   - Lines 347-397: `isShortContextFollowUpQuery()` - increase token limits
