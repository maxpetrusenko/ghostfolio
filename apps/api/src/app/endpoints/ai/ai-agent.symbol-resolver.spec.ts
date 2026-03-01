/**
 * Tests for SymbolResolverService
 */

import { SymbolResolverService } from './ai-agent.symbol-resolver';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { DataSource } from '@prisma/client';
import type { UserWithSettings } from '@ghostfolio/common/types';

import { Test, TestingModule } from '@nestjs/testing';

describe('SymbolResolverService', () => {
  let service: SymbolResolverService;
  let dataProviderService: jest.Mocked<DataProviderService>;
  let redisCacheService: jest.Mocked<RedisCacheService>;

  const mockUser: UserWithSettings = {
    id: 'test-user-id',
    alias: null,
    expression: null,
    settings: {
      language: null,
      baseCurrency: null,
      viewMode: null,
      isNewUser: null,
      subscribableToNewsletter: null
    },
    subscription: {
      type: 'Basic',
      expiresAt: null
    }
  } as unknown as UserWithSettings;

  beforeEach(async () => {
    const mockRedisCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined)
    };

    const mockDataProvider = {
      search: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SymbolResolverService,
        {
          provide: DataProviderService,
          useValue: mockDataProvider
        },
        {
          provide: RedisCacheService,
          useValue: mockRedisCache
        }
      ]
    }).compile();

    service = module.get<SymbolResolverService>(SymbolResolverService);
    dataProviderService = module.get(DataProviderService);
    redisCacheService = module.get(RedisCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveFromAliases', () => {
    it('should resolve tesla to TSLA', async () => {
      const result = await service.resolve(['tesla'], mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('TSLA');
      expect(result[0].confidence).toBe(1);
    });

    it('should resolve microsoft to MSFT', async () => {
      const result = await service.resolve(['microsoft'], mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('MSFT');
    });

    it('should resolve multiple hardcoded companies', async () => {
      const result = await service.resolve(['tesla', 'apple', 'nvidia'], mockUser);

      expect(result).toHaveLength(3);
      const symbols = result.map((r) => r.symbol).sort();
      expect(symbols).toEqual(['AAPL', 'NVDA', 'TSLA']);
    });

    it('should handle case-insensitive aliases', async () => {
      const result1 = await service.resolve(['TESLA'], mockUser);
      const result2 = await service.resolve(['TeSlA'], mockUser);
      const result3 = await service.resolve(['tesla'], mockUser);

      expect(result1[0].symbol).toBe('TSLA');
      expect(result2[0].symbol).toBe('TSLA');
      expect(result3[0].symbol).toBe('TSLA');
    });
  });

  describe('resolveFromSearch', () => {
    it('should call data provider search for unknown entities', async () => {
      dataProviderService.search.mockResolvedValue({
        items: [
          {
            symbol: 'META',
            name: 'Meta Platforms Inc',
            currency: 'USD',
            dataSource: 'YAHOO' as DataSource,
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            dataProviderInfo: {
              name: 'Yahoo Finance',
              isPremium: false
            }
          }
        ]
      });

      const result = await service.resolve(['meta platforms'], mockUser);

      expect(dataProviderService.search).toHaveBeenCalledWith({
        query: 'meta platforms',
        user: mockUser,
        includeIndices: false
      });
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('META');
    });

    it('should return null when no search results found', async () => {
      dataProviderService.search.mockResolvedValue({ items: [] });

      const result = await service.resolve(['unknown company xyz'], mockUser);

      expect(result).toHaveLength(0);
    });

    it('should handle data provider errors gracefully', async () => {
      dataProviderService.search.mockRejectedValue(new Error('API error'));

      const result = await service.resolve(['some company'], mockUser);

      expect(result).toHaveLength(0);
    });
  });

  describe('extractPotentialEntities', () => {
    it('should extract company names from natural language', () => {
      const entities = service.extractPotentialEntities('show me microsoft and spacex stocks');

      expect(entities).toContain('microsoft');
      expect(entities).toContain('spacex');
      expect(entities).toContain('microsoft spacex'); // multi-word phrase
    });

    it('should filter out finance stop words', () => {
      const entities = service.extractPotentialEntities('buy tesla stocks show price');

      expect(entities).not.toContain('buy');
      expect(entities).not.toContain('stocks');
      expect(entities).not.toContain('show');
      expect(entities).not.toContain('price');
      expect(entities).toContain('tesla');
    });

    it('should handle empty queries', () => {
      const entities = service.extractPotentialEntities('');

      expect(entities).toEqual([]);
    });

    it('should extract multi-word company names', () => {
      const entities = service.extractPotentialEntities('bank of america and johnson and johnson');

      expect(entities).toContain('bank america');
      expect(entities).toContain('johnson johnson');
      expect(entities).toContain('bank'); // single word
      expect(entities).toContain('america');
      expect(entities).toContain('johnson');
    });
  });

  describe('caching', () => {
    it('should cache resolved symbols', async () => {
      dataProviderService.search.mockResolvedValue({
        items: [
          {
            symbol: 'AMD',
            name: 'Advanced Micro Devices Inc',
            currency: 'USD',
            dataSource: 'YAHOO' as DataSource,
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            dataProviderInfo: {
              name: 'Yahoo Finance',
              isPremium: false
            }
          }
        ]
      });

      // First call - should hit data provider
      const result1 = await service.resolve(['advanced micro devices inc'], mockUser);
      expect(dataProviderService.search).toHaveBeenCalledTimes(1);
      expect(result1[0].cached).toBe(false);

      // Second call - should use memory cache
      const result2 = await service.resolve(['advanced micro devices inc'], mockUser);
      expect(dataProviderService.search).toHaveBeenCalledTimes(1); // Still 1, cached
      expect(result2[0].cached).toBe(true);
    });

    it('should use redis cache when available', async () => {
      const cachedEntry = JSON.stringify({
        symbol: 'INTC',
        name: 'Intel Corporation',
        dataSource: 'YAHOO',
        resolvedAt: Date.now()
      });

      redisCacheService.get.mockResolvedValue(cachedEntry);

      const result = await service.resolve(['intel corp'], mockUser);

      expect(dataProviderService.search).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('INTC');
      expect(result[0].cached).toBe(true);
    });
  });

  describe('extractFromAliases', () => {
    it('should extract ticker patterns like TSLA and AAPL', () => {
      // Private method test via public interface
      const entities = service.extractPotentialEntities('TSLA and AAPL');

      expect(entities).toContain('tsla');
      expect(entities).toContain('aapl');
    });
  });

  describe('findBestMatch', () => {
    it('should prioritize exact name matches', async () => {
      dataProviderService.search.mockResolvedValue({
        items: [
          {
            symbol: 'AAPL',
            name: 'Apple Inc',
            currency: 'USD',
            dataSource: 'YAHOO' as DataSource,
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            dataProviderInfo: {
              name: 'Yahoo Finance',
              isPremium: false
            }
          },
          {
            symbol: 'AAPL.SW',
            name: 'Apple Switzerland',
            currency: 'CHF',
            dataSource: 'YAHOO' as DataSource,
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            dataProviderInfo: {
              name: 'Yahoo Finance',
              isPremium: false
            }
          }
        ]
      });

      const result = await service.resolve(['apple'], mockUser);

      expect(result[0].symbol).toBe('AAPL');
      expect(result[0].confidence).toBeGreaterThan(0.9);
    });
  });

  describe('edge cases', () => {
    it('should handle very short entity names', async () => {
      const result = await service.resolve(['a'], mockUser);
      expect(result).toHaveLength(0);
    });

    it('should handle special characters in entity names', async () => {
      const entities = service.extractPotentialEntities('what about $#$ symbols?');

      expect(entities).not.toContain('$#$');
    });

    it('should deduplicate entities before resolving', async () => {
      const result = await service.resolve(['tesla', 'tesla', 'TESLA'], mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('TSLA');
    });
  });

  describe('confidence scoring', () => {
    it('should assign high confidence for exact matches', async () => {
      dataProviderService.search.mockResolvedValue({
        items: [
          {
            symbol: 'MSFT',
            name: 'Microsoft',
            currency: 'USD',
            dataSource: 'YAHOO' as DataSource,
            assetClass: 'EQUITY',
            assetSubClass: 'STOCK',
            dataProviderInfo: {
              name: 'Yahoo Finance',
              isPremium: false
            }
          }
        ]
      });

      const result = await service.resolve(['microsoft'], mockUser);

      expect(result[0].confidence).toBeGreaterThan(0.7);
    });
  });
});
