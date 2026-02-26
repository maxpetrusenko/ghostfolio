import { AiAgentWebSearchService } from './ai-agent.web-search';

describe('AiAgentWebSearchService', () => {
  const originalFetch = global.fetch;
  const originalTimeout = process.env.AI_AGENT_NEWS_FETCH_TIMEOUT_IN_MS;

  afterEach(() => {
    global.fetch = originalFetch;

    if (originalTimeout === undefined) {
      delete process.env.AI_AGENT_NEWS_FETCH_TIMEOUT_IN_MS;
    } else {
      process.env.AI_AGENT_NEWS_FETCH_TIMEOUT_IN_MS = originalTimeout;
    }
  });

  it('parses Yahoo RSS headline entries', async () => {
    const subject = new AiAgentWebSearchService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        [
          '<rss><channel>',
          '<item><title>Headline One</title><link>https://example.com/1</link><description>Summary one</description></item>',
          '<item><title>Headline Two</title><link>https://example.com/2</link><description>Summary two</description></item>',
          '</channel></rss>'
        ].join('')
      )
    } as never);

    const result = await subject.searchStockNews('AAPL', 'Apple');

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        link: 'https://example.com/1',
        source: 'Apple (AAPL)',
        title: 'Headline One'
      })
    );
  });

  it('returns graceful failure when news request exceeds timeout', async () => {
    process.env.AI_AGENT_NEWS_FETCH_TIMEOUT_IN_MS = '10';
    const subject = new AiAgentWebSearchService();
    global.fetch = jest.fn().mockImplementation((_, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    });

    const result = await subject.searchStockNews('TSLA', 'Tesla');

    expect(result).toEqual({
      results: [],
      success: false
    });
  });
});
