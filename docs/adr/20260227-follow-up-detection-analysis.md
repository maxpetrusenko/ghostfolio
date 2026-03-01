# Follow-Up Detection & Symbol Resolution - Architecture Design

**Status**: Proposed
**Date**: 2026-02-27
**Related**: ADR 2026-02-27-dynamic-symbol-resolution-research.md

## Overview

Enhance AI chat natural language understanding with:
1. Dynamic symbol resolution (not hardcoded)
2. Improved follow-up detection with entity continuity
3. LLM-assisted entity extraction for complex queries

## Current State

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Symbol Extraction                │
├─────────────────────────────────────────────────────────────┤
│  User Query → extractSymbolsFromQuery()                     │
│                    ↓                                        │
│  COMPANY_NAME_SYMBOL_ALIASES (100 entries, hardcoded)       │
│                    ↓                                        │
│  Returns: string[] symbols OR empty                         │
└─────────────────────────────────────────────────────────────┘
```

**Problems**:
- Only ~100 companies supported
- No fallback for unknown names
- Follow-up detection exists but entity propagation is limited

## Target Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Enhanced Symbol Resolution                  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  User Query: "show me microsoft and spacex stocks"           │
│       ↓                                                       │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Layer 1: Fast Path (hardcoded aliases)             │     │
│  │  → Check COMPANY_NAME_SYMBOL_ALIASES                │     │
│  │  → O(1) lookup, no API calls                        │     │
│  └─────────────────────────────────────────────────────┘     │
│       ↓ (no match)                                           │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Layer 2: Entity Token Extraction                   │     │
│  │  → Identify potential company name tokens           │     │
│  │  → Filter out finance verbs/prepositions            │     │
│  │  → "microsoft", "spacex"                            │     │
│  └─────────────────────────────────────────────────────┘     │
│       ↓                                                       │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Layer 3: Dynamic Symbol Search                     │     │
│  │  → DataProviderService.search("microsoft")           │     │
│  │  → DataProviderService.search("spacex")              │     │
│  │  → Cache results (LRU, 1hr TTL)                     │     │
│  │  → Returns: ["MSFT"], no match for spacex           │     │
│  └─────────────────────────────────────────────────────┘     │
│       ↓ (unresolved entities)                                 │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Layer 4: LLM Entity Extraction (optional)          │     │
│  │  → Use only for complex/ambiguous queries           │     │
│  │  → Extract: "SpaceX" is private, no ticker          │     │
│  └─────────────────────────────────────────────────────┘     │
│       ↓                                                       │
│  Returns: ["MSFT"] + context about SpaceX                    │
└──────────────────────────────────────────────────────────────┘
```

## Follow-Up Context Flow

```
Turn 1                    Turn 2 (Follow-Up)
────────                  ────────────────
User: "tesla stocks"      User: "and microsoft?"
  ↓                          ↓
Extract: TSLA              Detect: follow-up
  ↓                          ↓
Response: TSLA $408       Extract: "microsoft"
  ↓                          ↓
Store Context:             Resolve: MSFT via search
  entities: ["TSLA"]           ↓
  goalType: "lookup"       Merge: entities = ["TSLA", "MSFT"]
  tools: ["market_data"]        ↓
                              Response: TSLA $408, MSFT $415
```

## Component Design

### 1. SymbolResolver Service

**File**: `apps/api/src/app/endpoints/ai/ai-agent.symbol-resolver.ts`

```typescript
interface SymbolResolverConfig {
  cacheTtl: number;           // 1 hour default
  maxCacheSize: number;       // 1000 entries
  enableLlmFallback: boolean; // feature flag
}

interface ResolvedSymbol {
  symbol: string;
  name: string;
  dataSource: DataSource;
  confidence: number;         // 0-1
}

class SymbolResolver {
  constructor(
    private dataProviderService: DataProviderService,
    private redisCacheService: RedisCacheService,
    private config: SymbolResolverConfig
  ) {}

  /**
   * Main entry point - resolves potential company names to symbols
   */
  async resolve(
    entities: string[],
    user: UserWithSettings
  ): Promise<ResolvedSymbol[]>;

  /**
   * Fast path - checks hardcoded aliases only
   */
  private resolveFromAliases(entity: string): string | null;

  /**
   * Dynamic lookup - searches data provider
   */
  private async resolveFromSearch(
    entity: string,
    user: UserWithSettings
  ): Promise<ResolvedSymbol | null>;

  /**
   * LLM fallback - extracts entities from complex queries
   */
  private async extractWithLLM(query: string): Promise<string[]>;
}
```

### 2. Enhanced Entity Extraction

**File**: `apps/api/src/app/endpoints/ai/ai-agent.entity-extraction.ts`

```typescript
/**
 * Extracts potential company/stock names from natural language
 */
export async function extractEntitiesFromQuery(
  query: string,
  context?: {
    previousEntities?: string[];
    userHoldings?: string[];
  }
): Promise<{
  entities: string[];      // Potential company names
  symbols: string[];       // Direct symbol matches
  confidence: number;      // Overall extraction confidence
}> {
  // 1. Extract direct symbol patterns (TSLA, AAPL, etc.)
  const directSymbols = extractDirectSymbols(query);

  // 2. Remove finance tokens (buy, sell, portfolio, etc.)
  const cleanQuery = removeFinanceTokens(query);

  // 3. Extract noun phrases as potential entities
  const potentialEntities = extractNounPhrases(cleanQuery);

  // 4. Filter against previous context (if follow-up)
  const filteredEntities = filterByContext(
    potentialEntities,
    context
  );

  return {
    entities: filteredEntities,
    symbols: directSymbols,
    confidence: calculateConfidence(filteredEntities, directSymbols)
  };
}
```

### 3. Enhanced Follow-Up Handler

**Modification to**: `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts`

```typescript
/**
 * Enhanced follow-up resolution with entity continuity
 */
export async function resolveFollowUpContext({
  currentQuery,
  previousTurn,
  symbolResolver,
  user
}: {
  currentQuery: string;
  previousTurn?: AiAgentFollowUpResolverPreviousTurn;
  symbolResolver: SymbolResolver;
  user: UserWithSettings;
}): Promise<{
  isFollowUp: boolean;
  entities: string[];
  inheritedContext?: string[];
}> {
  // 1. Check if follow-up
  const signal = resolveFollowUpSignal({
    inferredPlannedTools: [],
    previousTurn,
    query: currentQuery
  });

  if (!signal.isLikelyFollowUp) {
    return { isFollowUp: false, entities: [] };
  }

  // 2. Extract new entities from current query
  const { entities: newEntities } = await extractEntitiesFromQuery(
    currentQuery,
    { previousEntities: previousTurn?.context?.entities }
  );

  // 3. Resolve new entities via SymbolResolver
  const resolvedNew = await symbolResolver.resolve(newEntities, user);

  // 4. Inherit entities from previous turn
  const inheritedSymbols = previousTurn?.context?.entities ?? [];

  // 5. Merge and deduplicate
  const allEntities = Array.from(new Set([
    ...inheritedSymbols,
    ...resolvedNew.map(r => r.symbol)
  ]));

  return {
    isFollowUp: true,
    entities: allEntities,
    inheritedContext: inheritedSymbols
  };
}
```

## Cache Strategy

```typescript
// Redis cache structure
interface SymbolCacheEntry {
  symbol: string;
  name: string;
  dataSource: DataSource;
  resolvedAt: string;
  query: string;
}

// Key format
const CACHE_KEY = (query: string) =>
  `symbol_search:${query.toLowerCase().trim()}`;

// TTL: 1 hour (symbols don't change frequently)
const CACHE_TTL = 60 * 60; // seconds
```

## Evaluation Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Symbol resolution accuracy | >95% | Test queries, verify symbols |
| Follow-up detection recall | >90% | Annotated conversation logs |
| Latency (with cache hit) | <100ms | Performance tests |
| Latency (cache miss) | <2s | Data provider search time |
| LLM fallback rate | <10% | Track when Layer 4 needed |

## Implementation Phases

### Phase 1: Core Dynamic Resolution
- [ ] Create `SymbolResolver` service
- [ ] Implement LRU cache with Redis
- [ ] Add `resolveFromSearch()` method
- [ ] Integrate with `extractSymbolsFromQuery()`

### Phase 2: Enhanced Entity Extraction
- [ ] Create `ai-agent.entity-extraction.ts`
- [ ] Implement noun phrase extraction
- [ ] Add finance token filtering
- [ ] Integrate with tool planning

### Phase 3: Follow-Up Entity Continuity
- [ ] Enhance `buildTurnContext()` to store resolved symbols
- [ ] Create `resolveFollowUpContext()` function
- [ ] Add entity merging logic
- [ ] Update `ai.service.ts` to use new context

### Phase 4: LLM Fallback (Optional)
- [ ] Implement LLM entity extraction
- [ ] Add cost/benefit analysis
- [ ] Feature flag for rollout

## Open Questions

1. **Multi-word companies**: "Microsoft Corporation" vs "microsoft" - handle both?
2. **Ambiguity**: "Apple" search returns AAPL but could mean the fruit - need disambiguation?
3. **Privacy symbols**: SpaceX is private - handle gracefully with explanation?
4. **International stocks**: Non-US symbols, ADRs - how to prioritize?

## Related ADRs

- Dynamic Symbol Resolution Research (2026-02-27)
