# Dynamic Symbol Resolution - Research Findings

**Date**: 2026-02-27
**Author**: AI Agent
**Status**: Research Complete

## Problem Statement

Current AI chat implementation uses hardcoded company name → symbol mappings (`COMPANY_NAME_SYMBOL_ALIASES`), limiting natural language understanding to ~100 companies. Users cannot naturally refer to stocks by company name beyond this static list.

### Evidence from Chat Logs

```
User: "buy me to tesla stocks"
Agent: [works - TSLA in hardcoded map]

User: "make and order for 2 tesla stocks"
Agent: [generic response - doesn't extract tesla properly in all contexts]

User: "what about microsoft?"
Agent: [would fail - MSFT not in aliases]
```

## Current Architecture Analysis

### Symbol Extraction Flow

```
User Query
    ↓
extractSymbolsFromQuery() [ai-agent.utils.ts]
    ↓
COMPANY_NAME_SYMBOL_ALIASES [hardcoded 100 entries]
    ↓
Returns: string[] of symbols
```

**Location**: `apps/api/src/app/endpoints/ai/ai-agent.utils.ts:32-146`

```typescript
const COMPANY_NAME_SYMBOL_ALIASES: Record<string, string> = {
  tesla: 'TSLA',      // line 121
  apple: 'AAPL',
  nvidia: 'NVDA',
  // ... ~100 total
};
```

### Follow-Up Detection Flow

```
User Query
    ↓
resolveFollowUpSignal() [ai-agent.policy.utils.ts]
    ├─ Token overlap analysis
    ├─ Demonstrative reference detection (that/this/it)
    ├─ Entity continuity check
    └─ Context freshness (< 45 min)
    ↓
Returns: isLikelyFollowUp + confidence scores
```

**Location**: `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts:464-589`

**Entity Tracking** (line 256-283):
- `buildTurnContext()` stores entities in turn memory
- Entities extracted via `extractSymbolsFromQuery()`
- Stored in `AiAgentFollowUpResolverPreviousTurn.context.entities`

## Discovery: Existing Dynamic Search Capability

**Found**: `DataProviderService.search()` exists!

```typescript
// Location: apps/api/src/services/data-provider/data-provider.service.ts:914-995
public async search({
  includeIndices = false,
  query,
  user
}: {
  includeIndices?: boolean;
  query: string;
  user: UserWithSettings;
}): Promise<LookupResponse>
```

**Response Structure**:
```typescript
interface LookupResponse {
  items: LookupItem[];
}

interface LookupItem {
  symbol: string;        // e.g., "MSFT"
  name: string;          // e.g., "Microsoft Corporation"
  currency: string;
  dataSource: DataSource;
  assetSubClass: string;
  dataProviderInfo: { ... };
}
```

**Capabilities**:
- Searches across ALL configured data sources
- Returns ranked results by name matching
- Handles ~100k+ symbols (not just 100)
- Used by symbol lookup UI component

## Proposed Solution Architecture

### Phase 1: Dynamic Symbol Lookup Fallback

```
User Query: "buy microsoft stocks"
    ↓
1. extractSymbolsFromQuery() - try hardcoded aliases first (fast path)
    ↓ (no match)
2. extractPotentialEntities() - identify company name tokens
    ↓
3. resolveSymbolsViaSearch() - call DataProviderService.search("microsoft")
    ↓
4. Return: ["MSFT"]
```

**Cache Strategy**:
- LRU cache for resolved name → symbol mappings
- TTL: 1 hour (symbols don't change frequently)
- Key: `symbol_search:${normalizedQuery}`

### Phase 2: LLM-Assisted Entity Extraction

For complex queries like "show me spacex and starlink stocks":

```typescript
async function extractEntitiesWithLLM(query: string): Promise<string[]> {
  const result = await generateText({
    model: openRouter('gpt-4o-mini'),
    prompt: `Extract company/stock names from: "${query}"
Return ONLY company names, comma-separated. No symbols, no explanation.`,
  });

  return result.text.split(',').map(s => s.trim());
}
```

### Phase 3: Enhanced Follow-Up Entity Resolution

When follow-up detected:
1. Check `previousTurn.context.entities` for stored symbols
2. For unresolved references ("it", "that"), resolve from previous tool results
3. Merge with any new entities from current query

**Example**:
```
Turn 1: User: "how is tesla doing?"
  → entities: ["TSLA"]
  → response: "TSLA at $408.58"

Turn 2: User: "and microsoft?"
  → follow-up detected
  → resolve "microsoft" via search → "MSFT"
  → merged entities: ["TSLA", "MSFT"]
```

## Implementation Tasks

1. [ ] Create `ai-agent.symbol-resolver.ts` - dynamic symbol lookup service
2. [ ] Add LRU cache layer for resolved symbols
3. [ ] Integrate with `extractSymbolsFromQuery()`
4. [ ] Add LLM entity extraction for complex queries
5. [ ] Enhance follow-up entity propagation
6. [ ] Add evals for symbol resolution accuracy

## Open Questions

1. **Rate limiting**: Data provider search calls - should we batch?
2. **Ambiguity**: "Apple" could return AAPL, apple futures, etc. Ranking strategy?
3. **LLM cost**: When to use LLM extraction vs regex patterns?

## References

- Current aliases: `apps/api/src/app/endpoints/ai/ai-agent.utils.ts:32-146`
- Follow-up logic: `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts:464-589`
- Data provider search: `apps/api/src/services/data-provider/data-provider.service.ts:914-995`
- Data provider interface: `apps/api/src/services/data-provider/interfaces/data-provider.interface.ts:11-52`
