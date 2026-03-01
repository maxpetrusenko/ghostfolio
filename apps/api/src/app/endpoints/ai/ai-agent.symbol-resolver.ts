/**
 * Dynamic Symbol Resolution Service
 *
 * Resolves company names and entity references to their ticker symbols
 * using a multi-layer approach:
 * 1. Hardcoded aliases (fast path)
 * 2. Data provider search (dynamic lookup)
 * 3. LLM-assisted extraction (complex queries)
 */

import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { LookupItem } from '@ghostfolio/common/interfaces';
import type { UserWithSettings } from '@ghostfolio/common/types';

import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from '@prisma/client';

const COMPANY_NAME_SYMBOL_ALIASES: Record<string, string> = {
  adobe: 'ADBE',
  'advanced micro devices': 'AMD',
  amd: 'AMD',
  airbnb: 'ABNB',
  alphabet: 'GOOGL',
  amazon: 'AMZN',
  amgen: 'AMGN',
  arm: 'ARM',
  asml: 'ASML',
  apple: 'AAPL',
  'bank of america': 'BAC',
  baidu: 'BIDU',
  bnd: 'BND',
  berkshire: 'BRK.B',
  'berkshire hathaway': 'BRK.B',
  'berkshire class b': 'BRK.B',
  blackrock: 'BLK',
  block: 'SQ',
  boeing: 'BA',
  booking: 'BKNG',
  broadcom: 'AVGO',
  cadence: 'CDNS',
  chevron: 'CVX',
  cisco: 'CSCO',
  citigroup: 'C',
  'coca cola': 'KO',
  coinbase: 'COIN',
  comcast: 'CMCSA',
  conocophillips: 'COP',
  costco: 'COST',
  crowdstrike: 'CRWD',
  delta: 'DAL',
  dia: 'DIA',
  disney: 'DIS',
  'eli lilly': 'LLY',
  exxon: 'XOM',
  'exxon mobil': 'XOM',
  ford: 'F',
  'general electric': 'GE',
  google: 'GOOGL',
  gld: 'GLD',
  'gold etf': 'GLD',
  'goldman sachs': 'GS',
  ibm: 'IBM',
  intel: 'INTC',
  intuit: 'INTU',
  ivv: 'IVV',
  iwm: 'IWM',
  jnj: 'JNJ',
  'johnson and johnson': 'JNJ',
  jpmorgan: 'JPM',
  linde: 'LIN',
  'lockheed martin': 'LMT',
  lowes: 'LOW',
  mastercard: 'MA',
  mcdonalds: 'MCD',
  mckesson: 'MCK',
  merck: 'MRK',
  meta: 'META',
  micron: 'MU',
  microsoft: 'MSFT',
  'morgan stanley': 'MS',
  netflix: 'NFLX',
  nike: 'NKE',
  nvidia: 'NVDA',
  oracle: 'ORCL',
  palantir: 'PLTR',
  paypal: 'PYPL',
  pepsico: 'PEP',
  pfizer: 'PFE',
  'procter and gamble': 'PG',
  qqq: 'QQQ',
  qualcomm: 'QCOM',
  raytheon: 'RTX',
  rivian: 'RIVN',
  's and p 500': 'SPY',
  's&p 500': 'SPY',
  salesforce: 'CRM',
  'schwab dividend': 'SCHD',
  schd: 'SCHD',
  servicenow: 'NOW',
  shopify: 'SHOP',
  's and p etf': 'SPY',
  sofi: 'SOFI',
  soxx: 'SOXX',
  's p 500': 'SPY',
  spotify: 'SPOT',
  spy: 'SPY',
  tesla: 'TSLA',
  'technology select sector': 'XLK',
  't mobile': 'TMUS',
  tmobile: 'TMUS',
  'top 100 nasdaq': 'QQQ',
  'total bond market': 'BND',
  'total stock market': 'VTI',
  'total world stock': 'VT',
  '20 year treasury': 'TLT',
  tlt: 'TLT',
  toyota: 'TM',
  tsmc: 'TSM',
  uber: 'UBER',
  unitedhealth: 'UNH',
  verizon: 'VZ',
  'vanguard s&p 500': 'VOO',
  'vanguard total stock market': 'VTI',
  visa: 'V',
  voo: 'VOO',
  vt: 'VT',
  vti: 'VTI',
  walmart: 'WMT',
  'wells fargo': 'WFC',
  xlk: 'XLK',
  xom: 'XOM'
};

const FINANCE_STOP_WORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'can i',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'how about',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'let',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'buy',
  'sell',
  'trade',
  'show',
  'what',
  'how',
  'when',
  'get',
  'give',
  'tell',
  'portfolio',
  'account',
  'holdings',
  'stocks',
  'shares',
  'price',
  'quote',
  'value',
  'worth',
  'balance',
  'market'
]);

const CACHE_KEY_PREFIX = 'symbol_search:';
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_CACHE_SIZE = 1000;

interface ResolvedSymbol {
  symbol: string;
  name: string;
  dataSource: DataSource;
  confidence: number;
  cached: boolean;
}

interface CacheEntry {
  symbol: string;
  name: string;
  dataSource: DataSource;
  resolvedAt: number;
}

/**
 * Simple in-memory LRU cache for resolved symbols
 * Acts as a fast first layer before Redis
 */
class SimpleLRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry;
    }
    return null;
  }

  set(
    key: string,
    value: Omit<CacheEntry, 'resolvedAt'>
  ): void {
    // Remove existing if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Evict oldest if at capacity
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    // Add new entry
    this.cache.set(key, { ...value, resolvedAt: Date.now() });
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

@Injectable()
export class SymbolResolverService {
  private readonly memoryCache = new SimpleLRUCache(MAX_CACHE_SIZE);
  private readonly logger = new Logger(SymbolResolverService.name);

  constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly redisCacheService: RedisCacheService
  ) {}

  /**
   * Main entry point: resolve entities to symbols
   * @param entities - Potential company names or symbols
   * @param user - User context for data provider access
   * @returns Resolved symbols with metadata
   */
  async resolve(
    entities: string[],
    user: UserWithSettings
  ): Promise<ResolvedSymbol[]> {
    if (!entities || entities.length === 0) {
      return [];
    }

    const results: ResolvedSymbol[] = [];
    const uniqueEntities = Array.from(new Set(entities.map((e) => e.toLowerCase().trim())));

    for (const entity of uniqueEntities) {
      if (!entity || entity.length < 2) {
        continue;
      }

      // Try each layer in sequence
      const resolved = await this.resolveEntity(entity, user);
      if (resolved) {
        results.push(resolved);
      }
    }

    return results;
  }

  /**
   * Resolve a single entity through layered approach
   */
  private async resolveEntity(
    entity: string,
    user: UserWithSettings
  ): Promise<ResolvedSymbol | null> {
    // Layer 1: Hardcoded aliases (fastest)
    const aliasResult = this.resolveFromAliases(entity);
    if (aliasResult) {
      return {
        ...aliasResult,
        confidence: 1,
        cached: false
      };
    }

    // Layer 2: Memory cache
    const memCacheResult = this.memoryCache.get(entity);
    if (memCacheResult) {
      const age = Date.now() - memCacheResult.resolvedAt;
      if (age < CACHE_TTL_SECONDS * 1000) {
        return {
          symbol: memCacheResult.symbol,
          name: memCacheResult.name,
          dataSource: memCacheResult.dataSource,
          confidence: 0.9,
          cached: true
        };
      }
      // Expired, remove from memory cache
      this.memoryCache.clear();
    }

    // Layer 3: Redis cache
    const redisKey = this.getCacheKey(entity);
    const redisResult = await this.redisCacheService.get(redisKey);
    if (redisResult) {
      try {
        const cached: CacheEntry = JSON.parse(redisResult);
        return {
          symbol: cached.symbol,
          name: cached.name,
          dataSource: cached.dataSource,
          confidence: 0.85,
          cached: true
        };
      } catch {
        // Invalid cache entry, ignore
      }
    }

    // Layer 4: Data provider search (dynamic lookup)
    const searchResult = await this.resolveFromSearch(entity, user);
    if (searchResult) {
      // Cache the result
      const cacheEntry: Omit<CacheEntry, 'resolvedAt'> = {
        symbol: searchResult.symbol,
        name: searchResult.name,
        dataSource: searchResult.dataSource
      };
      this.memoryCache.set(entity, cacheEntry);
      await this.redisCacheService.set(
        redisKey,
        JSON.stringify(cacheEntry),
        CACHE_TTL_SECONDS
      );

      return {
        ...searchResult,
        confidence: 0.8,
        cached: false
      };
    }

    // Entity could not be resolved
    this.logger.debug(`Unresolved entity: "${entity}"`);
    return null;
  }

  /**
   * Layer 1: Check hardcoded company name aliases
   */
  private resolveFromAliases(entity: string): {
    symbol: string;
    name: string;
    dataSource: DataSource;
  } | null {
    const normalized = entity.toLowerCase().trim();

    if (COMPANY_NAME_SYMBOL_ALIASES[normalized]) {
      const symbol = COMPANY_NAME_SYMBOL_ALIASES[normalized];
      return {
        symbol,
        name: symbol, // Alias doesn't store company name
        dataSource: 'YAHOO' as DataSource
      };
    }

    return null;
  }

  /**
   * Layer 4: Search via data provider
   */
  private async resolveFromSearch(
    entity: string,
    user: UserWithSettings
  ): Promise<{
    symbol: string;
    name: string;
    dataSource: DataSource;
    confidence: number;
  } | null> {
    try {
      const searchResults = await this.dataProviderService.search({
        query: entity,
        user,
        includeIndices: false
      });

      if (!searchResults.items || searchResults.items.length === 0) {
        return null;
      }

      // Find best match using simple string similarity
      const bestMatch = this.findBestMatch(entity, searchResults.items);

      if (!bestMatch) {
        return null;
      }

      return {
        symbol: bestMatch.symbol,
        name: bestMatch.name,
        dataSource: bestMatch.dataSource,
        confidence: this.calculateMatchConfidence(entity, bestMatch)
      };
    } catch (error) {
      this.logger.error(
        `Data provider search failed for "${entity}": ${error}`,
        'SymbolResolverService.resolveFromSearch'
      );
      return null;
    }
  }

  /**
   * Find best matching item from search results
   */
  private findBestMatch(
    query: string,
    items: LookupItem[]
  ): LookupItem | null {
    const normalizedQuery = query.toLowerCase().trim();

    // First try exact name match
    const exactMatch = items.find(
      (item) => item.name?.toLowerCase() === normalizedQuery
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Then try starts with
    const startsWithMatch = items.find((item) =>
      item.name?.toLowerCase().startsWith(normalizedQuery)
    );
    if (startsWithMatch) {
      return startsWithMatch;
    }

    // Then try contains
    const containsMatch = items.find((item) =>
      item.name?.toLowerCase().includes(normalizedQuery)
    );
    if (containsMatch) {
      return containsMatch;
    }

    // Fallback to first result
    return items[0] ?? null;
  }

  /**
   * Calculate confidence score for a match
   */
  private calculateMatchConfidence(
    query: string,
    match: LookupItem
  ): number {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedName = match.name?.toLowerCase() ?? '';

    if (normalizedName === normalizedQuery) {
      return 0.95;
    }

    if (normalizedName.startsWith(normalizedQuery)) {
      return 0.85;
    }

    if (normalizedName.includes(normalizedQuery)) {
      return 0.75;
    }

    return 0.6;
  }

  /**
   * Extract potential entity tokens from a query
   * Removes finance stop words and returns candidate company names
   */
  extractPotentialEntities(query: string): string[] {
    const normalized = query.toLowerCase().trim();

    // Remove punctuation and tokenize
    const tokens = normalized
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !FINANCE_STOP_WORDS.has(t));

    // Extract multi-word phrases (2-3 words)
    const entities: string[] = [];

    // Single words
    entities.push(...tokens);

    // Two-word combinations
    for (let i = 0; i < tokens.length - 1; i++) {
      entities.push(`${tokens[i]} ${tokens[i + 1]}`);
    }

    // Three-word combinations
    for (let i = 0; i < tokens.length - 2; i++) {
      entities.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
    }

    // Deduplicate while preserving order
    return Array.from(new Set(entities));
  }

  /**
   * Enhanced symbol extraction from query
   * Combines hardcoded alias matching with dynamic lookup
   */
  async extractSymbolsFromQuery(
    query: string,
    user: UserWithSettings
  ): Promise<string[]> {
    // First, use hardcoded aliases for speed
    const aliasSymbols = this.extractFromAliases(query);

    // Then, extract potential entities for dynamic lookup
    const potentialEntities = this.extractPotentialEntities(query);

    // Filter out entities that are already matched by aliases
    const entitiesToResolve = potentialEntities.filter(
      () => !aliasSymbols.some((symbol) =>
        query.toLowerCase().includes(symbol.toLowerCase())
      )
    );

    // Resolve entities dynamically
    const resolved = await this.resolve(entitiesToResolve, user);

    // Combine alias symbols with dynamically resolved symbols
    const allSymbols = Array.from(
      new Set([
        ...aliasSymbols,
        ...resolved.map((r) => r.symbol)
      ])
    );

    this.logger.debug(
      `Extracted ${allSymbols.length} symbols from query: ${query.slice(0, 50)}...`
    );

    return allSymbols;
  }

  /**
   * Fast path: extract symbols using only hardcoded aliases
   */
  private extractFromAliases(query: string): string[] {
    const symbols: string[] = [];

    for (const [alias, symbol] of Object.entries(COMPANY_NAME_SYMBOL_ALIASES)) {
      const pattern = new RegExp(`\\b${alias}\\b`, 'i');
      if (pattern.test(query)) {
        symbols.push(symbol);
      }
    }

    // Also extract direct ticker patterns (e.g., TSLA, AAPL)
    const tickerPattern = /\$?[A-Z]{2,6}\b/g;
    const tickerMatches = query.match(tickerPattern) ?? [];
    for (const ticker of tickerMatches) {
      const normalized = ticker.replace('$', '');
      if (/^[A-Z]{2,6}$/.test(normalized)) {
        symbols.push(normalized);
      }
    }

    return Array.from(new Set(symbols));
  }

  private getCacheKey(entity: string): string {
    return `${CACHE_KEY_PREFIX}${entity.toLowerCase().trim()}`;
  }

  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    // Note: Redis cache clearing would require pattern-based key deletion
    // which may not be available in all Redis configurations
    this.logger.log('Symbol resolver cache cleared');
  }
}
