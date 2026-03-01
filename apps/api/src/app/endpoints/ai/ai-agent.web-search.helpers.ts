import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { fetchSymbolNames } from './ai-agent.chat.helpers';

const NEWS_SYMBOL_LIMIT = 2;

export interface AiAgentStockNewsItem {
  link: string;
  publishedDate?: string;
  snippet: string;
  source: string;
  title: string;
}

export interface AiAgentStockNewsResult {
  results: AiAgentStockNewsItem[];
  success: boolean;
}

export interface AiAgentWebSearchService {
  searchStockNews: (
    symbol: string,
    companyName?: string,
    maxItems?: number
  ) => Promise<AiAgentStockNewsResult>;
}

interface NewsResponse {
  query: string;
  results: AiAgentStockNewsItem[];
  totalResults: number;
}

interface SymbolNewsData {
  name: string;
  news: NewsResponse;
}

export interface WebNewsSearchResult {
  formattedSummary: string;
  searchResultsBySymbol: Map<string, SymbolNewsData>;
  success: boolean;
  symbolsSearched: string[];
}

export async function searchWebNewsForSymbols({
  aiAgentWebSearchService,
  dataProviderService,
  portfolioAnalysis,
  symbols,
  maxItemsPerSymbol = 5
}: {
  aiAgentWebSearchService: AiAgentWebSearchService;
  dataProviderService: DataProviderService;
  portfolioAnalysis?: any;
  symbols: string[];
  maxItemsPerSymbol?: number;
}): Promise<WebNewsSearchResult> {
  const searchResultsBySymbol = new Map<string, SymbolNewsData>();
  const symbolsSearched: string[] = [];

  const normalizedSymbols = Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  ).slice(0, NEWS_SYMBOL_LIMIT);

  if (normalizedSymbols.length === 0) {
    return {
      formattedSummary: '',
      searchResultsBySymbol,
      success: true,
      symbolsSearched
    };
  }

  const symbolNames = await fetchSymbolNames({
    dataProviderService,
    portfolioAnalysis,
    symbols: normalizedSymbols
  });

  const searchEntries = await Promise.all(
    normalizedSymbols.map(async (symbol) => {
      const name = symbolNames.get(symbol) || symbol;

      return {
        symbol,
        name,
        searchResult: await aiAgentWebSearchService.searchStockNews(
          symbol,
          name
        )
      };
    })
  );

  for (const { name, searchResult, symbol } of searchEntries) {
    if (searchResult.success && searchResult.results.length > 0) {
      searchResultsBySymbol.set(symbol, {
        name,
        news: {
          query: `${symbol} ${name} news`,
          results: searchResult.results,
          totalResults: searchResult.results.length
        }
      });
      symbolsSearched.push(symbol);
    }
  }

  const formattedSummary = formatWebNewsSummary({
    searchResultsBySymbol,
    symbolsSearched,
    maxItemsPerSymbol
  });

  return {
    formattedSummary,
    searchResultsBySymbol,
    success: symbolsSearched.length > 0,
    symbolsSearched
  };
}

function formatWebNewsSummary({
  searchResultsBySymbol,
  symbolsSearched,
  maxItemsPerSymbol = 5
}: {
  searchResultsBySymbol: Map<string, SymbolNewsData>;
  symbolsSearched: string[];
  maxItemsPerSymbol?: number;
}): string {
  if (symbolsSearched.length === 0) {
    return 'No recent news found for the specified symbols.';
  }

  const summaryParts: string[] = [];

  for (const symbol of symbolsSearched) {
    const symbolData = searchResultsBySymbol.get(symbol);

    if (!symbolData) {
      continue;
    }

    const { name, news } = symbolData;
    const parts: string[] = [`\n${name} (${symbol})`];

    parts.push(`Found ${news.totalResults} recent news articles:\n`);

    for (const result of news.results.slice(0, maxItemsPerSymbol)) {
      const title = result.title.trim();
      const snippet = result.snippet.trim();
      const source = result.source;
      const link = result.link;

      parts.push(`- ${title}`);
      parts.push(`  ${snippet}`);
      parts.push(`  Source: ${source}`);
      parts.push(`  Link: ${link}\n`);
    }

    summaryParts.push(parts.join('\n'));
  }

  return summaryParts.join('\n\n');
}
