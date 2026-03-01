import { Injectable, Logger } from '@nestjs/common';

import { AiAgentStockNewsResult } from './ai-agent.web-search.helpers';

const DEFAULT_RESULT_LIMIT = 5;
const YAHOO_FINANCIAL_NEWS_ENDPOINT =
  'https://feeds.finance.yahoo.com/rss/2.0/headline';
const DEFAULT_NEWS_FETCH_TIMEOUT_IN_MS = 2_200;

function getNewsFetchTimeoutInMs() {
  const parsed = Number.parseInt(
    process.env.AI_AGENT_NEWS_FETCH_TIMEOUT_IN_MS ?? '',
    10
  );

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_NEWS_FETCH_TIMEOUT_IN_MS;
}

@Injectable()
export class AiAgentWebSearchService {
  private readonly logger = new Logger(AiAgentWebSearchService.name);

  public async searchStockNews(
    symbol: string,
    companyName?: string,
    maxItems: number = DEFAULT_RESULT_LIMIT
  ): Promise<AiAgentStockNewsResult> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    if (!normalizedSymbol) {
      return {
        results: [],
        success: false
      };
    }

    try {
      const abortController = new AbortController();
      const timeoutId: NodeJS.Timeout = setTimeout(() => {
        abortController.abort();
      }, getNewsFetchTimeoutInMs());
      timeoutId.unref?.();
      let response: Awaited<ReturnType<typeof fetch>>;

      try {
        response = await fetch(
          `${YAHOO_FINANCIAL_NEWS_ENDPOINT}?s=${encodeURIComponent(
            normalizedSymbol
          )}&region=US&lang=en-US`,
          {
            signal: abortController.signal
          }
        );
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        this.logger.warn(`Financial news request failed for ${normalizedSymbol}`);

        return {
          results: [],
          success: false
        };
      }

      const xml = await response.text();
      const itemPattern =
        /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description>(.*?)<\/description>[\s\S]*?<\/item>/gi;
      const results: AiAgentStockNewsResult['results'] = [];
      const source = companyName
        ? `${companyName} (${normalizedSymbol})`
        : normalizedSymbol;

      let match = itemPattern.exec(xml);

      while (match && results.length < maxItems) {
        const title = this.decodeXmlEntities(match[1]).trim();
        const link = this.decodeXmlEntities(match[2]).trim();
        const rawSnippet = this.decodeXmlEntities(match[3]).trim();
        const snippet = rawSnippet.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        if (title.length > 0 && link.length > 0) {
          results.push({
            link,
            source,
            snippet,
            title
          });
        }

        match = itemPattern.exec(xml);
      }

      return {
        results,
        success: results.length > 0
      };
    } catch (error) {
      this.logger.warn(
        `Financial news request error for ${normalizedSymbol}: ${String(error)}`
      );

      return {
        results: [],
        success: false
      };
    }
  }

  private decodeXmlEntities(value: string) {
    return value
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}
