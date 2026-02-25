import { DataSource } from '@prisma/client';
import { DataProviderResponse } from '@ghostfolio/common/interfaces';

import { DataProviderService } from './data-provider.service';

describe('DataProviderService', () => {
  let dataProviderService: DataProviderService;
  let configurationService: { get: jest.Mock };
  let redisCacheService: {
    get: jest.Mock;
    set: jest.Mock;
    getQuoteKey: jest.Mock;
  };
  let marketDataService: {
    getMax: jest.Mock;
    updateMany: jest.Mock;
  };
  let propertyService: { getByKey: jest.Mock };

  const dataProviderInterface = {
    canHandle: () => true,
    getAssetProfile: jest.fn(),
    getDataProviderInfo: () => {
      return {
        dataSource: DataSource.YAHOO,
        isPremium: false,
        name: 'Yahoo Finance',
        url: 'https://finance.yahoo.com'
      };
    },
    getDividends: jest.fn(),
    getHistorical: jest.fn(),
    getMaxNumberOfSymbolsPerRequest: () => 50,
    getName: () => DataSource.YAHOO,
    getQuotes: jest.fn(),
    getTestSymbol: () => 'AAPL',
    search: jest.fn()
  };

  beforeEach(() => {
    configurationService = {
      get: jest.fn((key: string) => {
        if (key === 'CACHE_QUOTES_TTL') {
          return 60000;
        }

        return undefined;
      })
    };

    redisCacheService = {
      get: jest.fn().mockResolvedValue(undefined),
      getQuoteKey: jest
        .fn()
        .mockImplementation(
          ({ dataSource, symbol }: { dataSource: string; symbol: string }) =>
            `quote:${dataSource}:${symbol}`
        ),
      set: jest.fn()
    };

    marketDataService = {
      getMax: jest.fn(),
      updateMany: jest.fn().mockResolvedValue([])
    };

    propertyService = {
      getByKey: jest.fn()
    };

    dataProviderService = new DataProviderService(
      configurationService as never,
      [dataProviderInterface],
      marketDataService as never,
      null,
      propertyService as never,
      redisCacheService as never
    );

    dataProviderService['dataProviderMapping'] = {};
  });

  it('falls back to latest market data if live quotes are missing', async () => {
    dataProviderInterface.getQuotes = jest.fn().mockResolvedValue({});
    marketDataService.getMax.mockResolvedValue({
      date: new Date('2026-02-20T10:00:00.000Z'),
      marketPrice: 142.15
    });

    const result = await dataProviderService.getQuotes({
      items: [
        {
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL'
        }
      ]
    });

    expect(dataProviderInterface.getQuotes).toHaveBeenCalledWith({
      requestTimeout: undefined,
      symbols: ['AAPL']
    });
    expect(marketDataService.getMax).toHaveBeenCalledWith({
      dataSource: DataSource.YAHOO,
      symbol: 'AAPL'
    });
    expect(result).toMatchObject({
      AAPL: {
        currency: 'AAPL',
        dataSource: DataSource.YAHOO,
        marketPrice: 142.15,
        marketState: 'closed'
      }
    });
  });

  it('does not duplicate provider calls for concurrent identical quote requests', async () => {
    let resolveQuotes: (value: { [symbol: string]: DataProviderResponse }) => void =
      () => {};
    const liveQuotePromise = new Promise<{
      [symbol: string]: DataProviderResponse;
    }>((resolve) => {
      resolveQuotes = resolve;
    });

    dataProviderInterface.getQuotes = jest.fn().mockReturnValue(liveQuotePromise);
    marketDataService.getMax.mockResolvedValue({
      date: new Date('2026-02-20T10:00:00.000Z'),
      marketPrice: 142.15
    });

    const firstRequest = dataProviderService.getQuotes({
      items: [
        {
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL'
        }
      ]
    });
    const secondRequest = dataProviderService.getQuotes({
      items: [
        {
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL'
        }
      ]
    });

    await Promise.resolve();
    resolveQuotes({
      AAPL: {
        currency: 'USD',
        dataSource: DataSource.YAHOO,
        marketPrice: 145.0,
        marketState: 'open'
      }
    });

    const [firstResult, secondResult] = await Promise.all([
      firstRequest,
      secondRequest
    ]);

    expect(dataProviderInterface.getQuotes).toHaveBeenCalledTimes(1);
    expect(firstResult.AAPL.marketPrice).toBe(145);
    expect(secondResult.AAPL.marketPrice).toBe(145);
    expect(firstResult).toEqual(secondResult);
  });

  it('falls back per-symbol while keeping provider-provided quotes', async () => {
    dataProviderInterface.getQuotes = jest.fn().mockResolvedValue({
      AAPL: {
        currency: 'USD',
        dataSource: DataSource.YAHOO,
        marketPrice: 190.25,
      marketState: 'open'
      }
    });

    marketDataService.getMax.mockResolvedValue({
      date: new Date('2026-02-20T10:00:00.000Z'),
      marketPrice: 142.15
    });

    const result = await dataProviderService.getQuotes({
      items: [
        {
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL'
        },
        {
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT'
        }
      ]
    });

    expect(dataProviderInterface.getQuotes).toHaveBeenCalledWith({
      requestTimeout: undefined,
      symbols: ['AAPL', 'MSFT']
    });
    expect(marketDataService.getMax).toHaveBeenCalledWith({
      dataSource: DataSource.YAHOO,
      symbol: 'MSFT'
    });
    expect(result.AAPL.marketPrice).toBe(190.25);
    expect(result.MSFT.marketPrice).toBe(142.15);
    expect(result.MSFT.marketState).toBe('closed');
  });

  it('skips provider calls during quote cooldown after a provider failure', async () => {
    dataProviderInterface.getQuotes = jest
      .fn()
      .mockRejectedValue(new Error('provider overloaded'));
    marketDataService.getMax.mockResolvedValue({
      date: new Date('2026-02-20T10:00:00.000Z'),
      marketPrice: 142.15
    });

    const firstResult = await dataProviderService.getQuotes({
      items: [
        {
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL'
        }
      ]
    });
    const secondResult = await dataProviderService.getQuotes({
      items: [
        {
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL'
        }
      ]
    });

    expect(dataProviderInterface.getQuotes).toHaveBeenCalledTimes(1);
    expect(firstResult.AAPL.marketPrice).toBe(142.15);
    expect(secondResult.AAPL.marketPrice).toBe(142.15);
    expect(firstResult).toEqual(secondResult);
  });
});
