import { Injectable, Logger } from '@nestjs/common';

import { AiAgentStockNewsResult } from './ai-agent.web-search.helpers';

const RESULT_LIMIT = 5;
const YAHOO_FINANCIAL_NEWS_ENDPOINT =
  'https://feeds.finance.yahoo.com/rss/2.0/headline';

@Injectable()
export class AiAgentWebSearchService {
  private readonly logger = new Logger(AiAgentWebSearchService.name);

  public async searchStockNews(
    symbol: string,
    companyName?: string
  ): Promise<AiAgentStockNewsResult> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    if (!normalizedSymbol) {
      return {
        results: [],
        success: false
      };
    }

    try {
      const response = await fetch(
        `${YAHOO_FINANCIAL_NEWS_ENDPOINT}?s=${encodeURIComponent(
          normalizedSymbol
        )}&region=US&lang=en-US`
      );

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

      while (match && results.length < RESULT_LIMIT) {
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
