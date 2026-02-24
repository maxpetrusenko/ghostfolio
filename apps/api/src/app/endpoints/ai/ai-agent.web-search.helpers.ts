import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import { fetchSymbolNames } from './ai-agent.chat.helpers';
import { AiAgentWebSearchService } from './ai-agent.web-search';

interface NewsResultItem {
  link: string;
  publishedDate?: string;
  snippet: string;
  source: string;
  title: string;
}

interface NewsResponse {
  query: string;
  results: NewsResultItem[];
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
  symbols
}: {
  aiAgentWebSearchService: AiAgentWebSearchService;
  dataProviderService: DataProviderService;
  portfolioAnalysis?: any;
  symbols: string[];
}): Promise<WebNewsSearchResult> {
  const searchResultsBySymbol = new Map<string, SymbolNewsData>();
  const symbolsSearched: string[] = [];

  if (symbols.length === 0) {
    return {
      formattedSummary: '',
      searchResultsBySymbol,
      success: true,
      symbolsSearched
    };
  }

  const symbolNames = await fetchSymbolNames({
    dataProviderService,
    symbols
  });

  for (const symbol of symbols) {
    const name = symbolNames.get(symbol) || symbol;
    const searchResult = await aiAgentWebSearchService.searchStockNews(
      symbol,
      name
    );

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
    symbolsSearched
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
  symbolsSearched
}: {
  searchResultsBySymbol: Map<string, SymbolNewsData>;
  symbolsSearched: string[];
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

    for (const result of news.results.slice(0, 5)) {
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
