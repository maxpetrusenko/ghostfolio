import { DataSource } from '@prisma/client';

import {
  buildAnswer,
  createPreferenceSummaryResponse,
  getUserPreferences,
  isPreferenceRecallQuery,
  resolveSymbols,
  resolvePreferenceUpdate
} from './ai-agent.chat.helpers';

describe('AiAgentChatHelpers', () => {
  const originalLlmTimeout = process.env.AI_AGENT_LLM_TIMEOUT_IN_MS;

  afterEach(() => {
    if (originalLlmTimeout === undefined) {
      delete process.env.AI_AGENT_LLM_TIMEOUT_IN_MS;
    } else {
      process.env.AI_AGENT_LLM_TIMEOUT_IN_MS = originalLlmTimeout;
    }
  });

  it('returns deterministic fallback when llm generation exceeds timeout', async () => {
    process.env.AI_AGENT_LLM_TIMEOUT_IN_MS = '20';

    const startedAt = Date.now();
    const answer = await buildAnswer({
      generateText: () => {
        return new Promise<{ text?: string }>(() => undefined);
      },
      languageCode: 'en',
      memory: { turns: [] },
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.6,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 6000
          },
          {
            allocationInPercentage: 0.4,
            dataSource: DataSource.YAHOO,
            symbol: 'MSFT',
            valueInBaseCurrency: 4000
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 10000
      },
      query: 'Show my portfolio allocation overview',
      userCurrency: 'USD'
    });

    expect(Date.now() - startedAt).toBeLessThan(700);
    expect(answer).toContain('Largest long allocations:');
  });

  it('resolves top N holdings for fundamentals queries that request top stocks', () => {
    const symbols = resolveSymbols({
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.3,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 3000
          },
          {
            allocationInPercentage: 0.2,
            dataSource: DataSource.YAHOO,
            symbol: 'MSFT',
            valueInBaseCurrency: 2000
          },
          {
            allocationInPercentage: 0.15,
            dataSource: DataSource.YAHOO,
            symbol: 'NVDA',
            valueInBaseCurrency: 1500
          },
          {
            allocationInPercentage: 0.14,
            dataSource: DataSource.YAHOO,
            symbol: 'AMZN',
            valueInBaseCurrency: 1400
          },
          {
            allocationInPercentage: 0.12,
            dataSource: DataSource.YAHOO,
            symbol: 'GOOGL',
            valueInBaseCurrency: 1200
          },
          {
            allocationInPercentage: 0.09,
            dataSource: DataSource.YAHOO,
            symbol: 'META',
            valueInBaseCurrency: 900
          }
        ],
        holdingsCount: 6,
        totalValueInBaseCurrency: 10000
      },
      query: 'fundamentals on top 5 stocks'
    });

    expect(symbols).toEqual(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL']);
  });

  it('keeps default derived symbol count at three when top count is not specified', () => {
    const symbols = resolveSymbols({
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.4,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 4000
          },
          {
            allocationInPercentage: 0.35,
            dataSource: DataSource.YAHOO,
            symbol: 'MSFT',
            valueInBaseCurrency: 3500
          },
          {
            allocationInPercentage: 0.25,
            dataSource: DataSource.YAHOO,
            symbol: 'NVDA',
            valueInBaseCurrency: 2500
          },
          {
            allocationInPercentage: 0.1,
            dataSource: DataSource.YAHOO,
            symbol: 'AVGO',
            valueInBaseCurrency: 1000
          }
        ],
        holdingsCount: 4,
        totalValueInBaseCurrency: 11000
      },
      query: 'fundamentals on top stocks'
    });

    expect(symbols).toEqual(['AAPL', 'MSFT', 'NVDA']);
  });

  it('keeps generated response when answer passes reliability gate', async () => {
    const generatedText =
      'Trim AAPL by 5% and allocate the next 1000 USD toward MSFT and BND. This lowers concentration risk and improves balance.';

    const answer = await buildAnswer({
      generateText: jest.fn().mockResolvedValue({
        text: generatedText
      }),
      languageCode: 'en',
      memory: { turns: [] },
      query: 'Summarize my concentration risk and next move.',
      userCurrency: 'USD'
    });

    expect(answer).toBe(generatedText);
  });

  it('adds deterministic diversification action guidance when generated answer is unreliable', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockResolvedValue({
        text: 'Diversify.'
      }),
      languageCode: 'en',
      memory: { turns: [] },
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.7,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 7000
          },
          {
            allocationInPercentage: 0.3,
            dataSource: DataSource.YAHOO,
            symbol: 'MSFT',
            valueInBaseCurrency: 3000
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 10000
      },
      query: 'help me diversify',
      userCurrency: 'USD'
    });

    expect(answer).toContain('AAPL');
    expect(answer).toContain('Option 1 (new money first):');
    expect(answer).toContain('Option 2 (sell and rebalance):');
    expect(answer).toContain('Assumptions:');
    expect(answer).toContain('Next questions:');
  });

  it('falls back to recommendation options when generated recommendation lacks option structure', async () => {
    const generatedText =
      'Risk concentration is high and your top position remains elevated. Redirect contributions and gradually reduce concentration while monitoring drift every month.';

    const answer = await buildAnswer({
      generateText: jest.fn().mockResolvedValue({
        text: generatedText
      }),
      languageCode: 'en',
      memory: { turns: [] },
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.7,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 7000
          },
          {
            allocationInPercentage: 0.3,
            dataSource: DataSource.YAHOO,
            symbol: 'MSFT',
            valueInBaseCurrency: 3000
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 10000
      },
      query: 'help me diversify',
      riskAssessment: {
        concentrationBand: 'high',
        hhi: 0.58,
        topHoldingAllocation: 0.7
      },
      userCurrency: 'USD'
    });

    expect(answer).not.toBe(generatedText);
    expect(answer).toContain('Option 1 (new money first):');
    expect(answer).toContain('Option 2 (sell and rebalance):');
    expect(answer).toContain('Risk notes:');
  });

  it('uses recommendation-composer prompt structure for action-intent queries', async () => {
    const generateText = jest.fn().mockResolvedValue({
      text: 'Summary: reduce top concentration with staged reallocation. Option 1 uses new money first. Option 2 trims overweight exposure gradually.'
    });

    await buildAnswer({
      generateText,
      languageCode: 'en',
      memory: { turns: [] },
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.66,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 6600
          },
          {
            allocationInPercentage: 0.34,
            dataSource: DataSource.YAHOO,
            symbol: 'VTI',
            valueInBaseCurrency: 3400
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 10000
      },
      query: 'What should I do to diversify?',
      userCurrency: 'USD'
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Recommendation context (JSON):')
      })
    );
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Option 1 (new money first)')
      })
    );
  });

  it('passes full memory history as structured messages to the model call', async () => {
    const generateText = jest.fn().mockResolvedValue({
      text:
        'Risk remains elevated with top concentration at 70.0%. Option: trim 5% and reallocate in stages.'
    });

    await buildAnswer({
      generateText,
      languageCode: 'en',
      memory: {
        turns: [
          {
            answer: 'Your concentration is high at 70.0% in AAPL.',
            query: 'Show my concentration risk',
            timestamp: '2026-02-24T18:00:00.000Z',
            toolCalls: [{ status: 'success', tool: 'risk_assessment' }]
          },
          {
            answer: 'Top holdings are AAPL and MSFT.',
            query: 'Show my holdings',
            timestamp: '2026-02-24T18:01:00.000Z',
            toolCalls: [{ status: 'success', tool: 'portfolio_analysis' }]
          }
        ]
      },
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.7,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 7000
          },
          {
            allocationInPercentage: 0.3,
            dataSource: DataSource.YAHOO,
            symbol: 'MSFT',
            valueInBaseCurrency: 3000
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 10000
      },
      query: 'Why is it high?',
      userCurrency: 'USD'
    });

    const call = generateText.mock.calls[0][0];
    expect(call.messages).toHaveLength(6);
    expect(call.messages[0]).toEqual({
      content: 'You are a neutral financial assistant.',
      role: 'system'
    });
    expect(call.messages[1]).toEqual({
      content: 'Show my concentration risk',
      role: 'user'
    });
    expect(call.messages[2]).toEqual({
      content: 'Your concentration is high at 70.0% in AAPL.',
      role: 'assistant'
    });
    expect(call.messages[3]).toEqual({
      content: 'Show my holdings',
      role: 'user'
    });
    expect(call.messages[4]).toEqual({
      content: 'Top holdings are AAPL and MSFT.',
      role: 'assistant'
    });
    expect(call.messages[5]).toEqual(
      expect.objectContaining({
        content: expect.stringContaining('Query: Why is it high?'),
        role: 'user'
      })
    );
  });

  it('uses detailed analysis prompt structure for fundamentals queries', async () => {
    const generateText = jest.fn().mockResolvedValue({
      text:
        'Snapshot: TSLA remains a high-volatility growth name with material execution risk. Drivers: demand elasticity, margin pressure, and storage ramp dynamics. Risks: valuation compression, China competition, and guidance misses. Portfolio impact: cap single-name sizing to fit risk budget. Actionable next steps: define entry bands, set a downside threshold, and review catalyst calendar. Decision checklist: confirm thesis horizon, stop-loss policy, and max position size.'
    });

    await buildAnswer({
      assetFundamentalsSummary: 'Fundamental analysis:\nTSLA — Tesla, Inc. (EQUITY)',
      generateText,
      languageCode: 'en',
      memory: { turns: [] },
      query: 'fundamentals on tesla stock?',
      userCurrency: 'USD'
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Output sections (in order):')
      })
    );
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Decision checklist')
      })
    );
  });

  it('uses detailed analysis prompt structure for typo-prefixed fundamentals queries', async () => {
    const generateText = jest.fn().mockResolvedValue({
      text:
        'Snapshot: TSLA setup reflects valuation-sensitive growth. Drivers: delivery momentum, pricing discipline, and storage growth. Risks: multiple compression and execution misses. Portfolio impact: keep position sizing inside risk budget. Actionable next steps: define entry/exit levels, evaluate catalysts, and align with concentration limits. Decision checklist: confirm thesis duration, downside limit, and max weight.'
    });

    await buildAnswer({
      assetFundamentalsSummary: 'Fundamental analysis:\nTSLA — Tesla, Inc. (EQUITY)',
      generateText,
      languageCode: 'en',
      memory: { turns: [] },
      query: 'wfundamentals on tesla stock?',
      userCurrency: 'USD'
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Output sections (in order):')
      })
    );
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Decision checklist')
      })
    );
  });

  it('parses and persists concise response-style preference updates', () => {
    const result = resolvePreferenceUpdate({
      query: 'Remember to keep responses concise.',
      userPreferences: {}
    });

    expect(result.shouldPersist).toBe(true);
    expect(result.userPreferences.responseStyle).toBe('concise');
    expect(result.acknowledgement).toContain('Saved preference');
  });

  it('recognizes preference recall queries and renders deterministic summary', () => {
    expect(isPreferenceRecallQuery('What do you remember about me?')).toBe(true);
    expect(
      createPreferenceSummaryResponse({
        userPreferences: {
          responseStyle: 'concise',
          updatedAt: '2026-02-24T10:00:00.000Z'
        }
      })
    ).toContain('response style: concise');
  });

  it('returns empty preferences for malformed user preference payload', async () => {
    const redisCacheService = {
      get: jest.fn().mockResolvedValue('{bad-json')
    };

    const result = await getUserPreferences({
      redisCacheService: redisCacheService as never,
      userId: 'user-1'
    });

    expect(result).toEqual({});
  });

  it.each([
    'What do you remember about me?',
    'show my preferences',
    'Show preferences',
    'What are my preferences?',
    'which preferences do you remember',
    'which preferences did you save'
  ])('matches preference recall pattern for "%s"', (query) => {
    expect(isPreferenceRecallQuery(query)).toBe(true);
  });

  it.each([
    'Show my portfolio risk',
    'Rebalance my holdings',
    'hello',
    'help me diversify'
  ])('does not match preference recall pattern for "%s"', (query) => {
    expect(isPreferenceRecallQuery(query)).toBe(false);
  });

  it.each([
    'keep answers concise',
    'answer briefly',
    'responses concise please',
    'keep replies short'
  ])('detects concise preference phrase "%s"', (query) => {
    const result = resolvePreferenceUpdate({
      query,
      userPreferences: {}
    });

    expect(result.shouldPersist).toBe(true);
    expect(result.userPreferences.responseStyle).toBe('concise');
    expect(result.acknowledgement).toContain('Saved preference');
  });

  it.each([
    'keep responses detailed',
    'answer in detail',
    'more detail please',
    'responses verbose'
  ])('detects detailed preference phrase "%s"', (query) => {
    const result = resolvePreferenceUpdate({
      query,
      userPreferences: {}
    });

    expect(result.shouldPersist).toBe(true);
    expect(result.userPreferences.responseStyle).toBe('detailed');
    expect(result.acknowledgement).toContain('Saved preference');
  });

  it('returns no-op when preference query is ambiguous', () => {
    const result = resolvePreferenceUpdate({
      query: 'keep responses concise and add more detail',
      userPreferences: {
        responseStyle: 'concise',
        updatedAt: '2026-02-24T10:00:00.000Z'
      }
    });

    expect(result.shouldPersist).toBe(false);
    expect(result.userPreferences.responseStyle).toBe('concise');
    expect(result.acknowledgement).toBeUndefined();
  });

  it('returns already-saved acknowledgement when style does not change', () => {
    const result = resolvePreferenceUpdate({
      query: 'keep answers concise',
      userPreferences: {
        responseStyle: 'concise',
        updatedAt: '2026-02-24T10:00:00.000Z'
      }
    });

    expect(result.shouldPersist).toBe(false);
    expect(result.acknowledgement).toContain('Preference already saved');
  });

  it('clears stored preferences when clear command is issued', () => {
    const result = resolvePreferenceUpdate({
      query: 'clear my saved preferences',
      userPreferences: {
        responseStyle: 'detailed',
        updatedAt: '2026-02-24T10:00:00.000Z'
      }
    });

    expect(result.shouldPersist).toBe(true);
    expect(result.userPreferences).toEqual({});
    expect(result.acknowledgement).toContain('Cleared');
  });

  it('returns no-op clear acknowledgement when no preferences exist', () => {
    const result = resolvePreferenceUpdate({
      query: 'reset preferences',
      userPreferences: {}
    });

    expect(result.shouldPersist).toBe(false);
    expect(result.userPreferences).toEqual({});
    expect(result.acknowledgement).toContain('No saved cross-session preferences');
  });

  it('returns deterministic summary for empty preference state', () => {
    expect(
      createPreferenceSummaryResponse({
        userPreferences: {}
      })
    ).toBe('I have no saved cross-session preferences yet.');
  });

  it('builds fallback with market snapshot when llm output is unavailable', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      marketData: {
        quotes: [
          {
            currency: 'USD',
            marketPrice: 210.12,
            marketState: 'REGULAR',
            symbol: 'AAPL'
          }
        ],
        symbolsRequested: ['AAPL']
      },
      memory: { turns: [] },
      query: 'show market quote',
      userCurrency: 'USD'
    });

    expect(answer).toContain('Market snapshot: AAPL: 210.12 USD');
  });

  it('adds decision checklist to fundamentals fallback when llm output is unavailable', async () => {
    const answer = await buildAnswer({
      assetFundamentalsSummary:
        'Fundamental analysis:\nTSLA — Tesla, Inc. (EQUITY)\nSectors: Consumer Cyclical 100.0%',
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      memory: { turns: [] },
      query: 'fundamentals on tesla stock?',
      userCurrency: 'USD'
    });

    expect(answer).toContain('Fundamental analysis:');
    expect(answer).toContain('Decision checklist:');
  });

  it('adds decision checklist to typo-prefixed fundamentals fallback when llm output is unavailable', async () => {
    const answer = await buildAnswer({
      assetFundamentalsSummary:
        'Fundamental analysis:\nTSLA — Tesla, Inc. (EQUITY)\nSectors: Consumer Cyclical 100.0%',
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      memory: { turns: [] },
      query: 'wfundamentals on tesla stock?',
      userCurrency: 'USD'
    });

    expect(answer).toContain('Fundamental analysis:');
    expect(answer).toContain('Decision checklist:');
  });

  it('builds fallback with limited-coverage message when quotes are missing', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      marketData: {
        quotes: [],
        symbolsRequested: ['AAPL', 'TSLA']
      },
      memory: { turns: [] },
      query: 'show market quote',
      userCurrency: 'USD'
    });

    expect(answer).toContain(
      'Market data request completed with limited quote coverage for: AAPL, TSLA.'
    );
  });

  it('limits fallback output to two lines when concise preference is saved', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      memory: {
        turns: [
          {
            answer: 'prior answer',
            query: 'prior query',
            timestamp: '2026-02-24T10:00:00.000Z',
            toolCalls: [{ status: 'success', tool: 'portfolio_analysis' }]
          }
        ]
      },
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.6,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 6000
          },
          {
            allocationInPercentage: 0.4,
            dataSource: DataSource.YAHOO,
            symbol: 'MSFT',
            valueInBaseCurrency: 4000
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 10000
      },
      query: 'show allocation overview',
      userCurrency: 'USD',
      userPreferences: {
        responseStyle: 'concise',
        updatedAt: '2026-02-24T10:00:00.000Z'
      }
    });

    expect(answer.split('\n').length).toBeLessThanOrEqual(2);
  });

  it('keeps fallback user-facing by omitting session-memory status lines', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      memory: {
        turns: [
          {
            answer: 'prior answer',
            query: 'prior query',
            timestamp: '2026-02-24T10:00:00.000Z',
            toolCalls: [{ status: 'success', tool: 'portfolio_analysis' }]
          },
          {
            answer: 'second answer',
            query: 'second query',
            timestamp: '2026-02-24T10:01:00.000Z',
            toolCalls: [{ status: 'success', tool: 'risk_assessment' }]
          }
        ]
      },
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.6,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 6000
          },
          {
            allocationInPercentage: 0.4,
            dataSource: DataSource.YAHOO,
            symbol: 'MSFT',
            valueInBaseCurrency: 4000
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 10000
      },
      query: 'show allocation overview',
      userCurrency: 'USD'
    });

    expect(answer).toContain('Largest long allocations:');
    expect(answer).not.toContain('Session memory applied');
  });

  it('includes recommendation fallback options when recommendation query is unreliable', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockResolvedValue({
        text: 'Diversify.'
      }),
      languageCode: 'en',
      memory: { turns: [] },
      portfolioAnalysis: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.7,
            dataSource: DataSource.YAHOO,
            symbol: 'AAPL',
            valueInBaseCurrency: 7000
          },
          {
            allocationInPercentage: 0.3,
            dataSource: DataSource.YAHOO,
            symbol: 'VTI',
            valueInBaseCurrency: 3000
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 10000
      },
      query: 'what should i do to diversify',
      riskAssessment: {
        concentrationBand: 'high',
        hhi: 0.58,
        topHoldingAllocation: 0.7
      },
      userCurrency: 'USD'
    });

    expect(answer).toContain('Option 1 (new money first)');
    expect(answer).toContain('Option 2 (sell and rebalance)');
    expect(answer).toContain('Next questions:');
  });

  it('includes stress and rebalance fallback sections when llm fails', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      memory: { turns: [] },
      query: 'run rebalance and stress test',
      rebalancePlan: {
        maxAllocationTarget: 0.35,
        overweightHoldings: [
          {
            currentAllocation: 0.55,
            reductionNeeded: 0.2,
            symbol: 'AAPL'
          }
        ],
        underweightHoldings: [
          {
            currentAllocation: 0.12,
            symbol: 'VTI'
          }
        ]
      },
      stressTest: {
        estimatedDrawdownInBaseCurrency: 3200,
        estimatedPortfolioValueAfterShock: 12800,
        longExposureInBaseCurrency: 16000,
        shockPercentage: 0.2
      },
      userCurrency: 'USD'
    });

    expect(answer).toContain('Rebalance priority');
    expect(answer).toContain('Stress test (20% downside)');
  });

  it('falls back to guidance prompt when no context sections exist', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      memory: { turns: [] },
      query: 'anything else?',
      userCurrency: 'USD'
    });

    expect(answer).toContain(
      'Portfolio context is available. Ask about holdings, risk concentration, or symbol prices for deeper analysis.'
    );
  });

  it('keeps action execution summary in fallback answer', async () => {
    const answer = await buildAnswer({
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      memory: { turns: [] },
      query: 'add 1000 usd seed funds for testing',
      userCurrency: 'USD',
      additionalContextSummaries: ['seed_funds executed: seed funds order abc123 created']
    });

    expect(answer).toContain(
      'seed_funds executed: seed funds order abc123 created'
    );
    expect(answer).not.toContain(
      'Portfolio context is available. Ask about holdings, risk concentration, or symbol prices for deeper analysis.'
    );
  });

  it('uses news-brief prompt structure for news-focused queries', async () => {
    const generateText = jest.fn().mockResolvedValue({
      text: 'Headline recap: NVDA launches new data-center roadmap with strong demand guidance.'
    });

    await buildAnswer({
      financialNewsSummary: [
        'News catalysts (latest):',
        '- NVDA reports stronger demand from cloud customers.'
      ].join('\n'),
      generateText,
      languageCode: 'en',
      memory: { turns: [] },
      query: 'latest nvidia news recap',
      userCurrency: 'USD'
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Task: produce a concise, information-dense market news brief.')
      })
    );
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Headline recap (3-5 bullets)')
      })
    );
  });

  it('returns deterministic news brief fallback when llm generation fails', async () => {
    const answer = await buildAnswer({
      financialNewsSummary: [
        'News catalysts (latest):',
        '- NVDA raises data-center guidance.',
        '- Analysts revised earnings estimates upward.'
      ].join('\n'),
      generateText: jest.fn().mockRejectedValue(new Error('offline')),
      languageCode: 'en',
      marketData: {
        quotes: [
          {
            currency: 'USD',
            marketPrice: 123.45,
            marketState: 'REGULAR',
            symbol: 'NVDA'
          }
        ],
        symbolsRequested: ['NVDA']
      },
      memory: { turns: [] },
      query: 'show me nvda headlines',
      userCurrency: 'USD'
    });

    expect(answer).toContain('News brief:');
    expect(answer).toContain('- NVDA raises data-center guidance.');
    expect(answer).toContain('Market snapshot: NVDA 123.45 USD.');
    expect(answer).toContain('Watch next:');
  });

  it('sanitizes malformed user preference payload fields', async () => {
    const redisCacheService = {
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          responseStyle: 'unsupported',
          updatedAt: 12345
        })
      )
    };

    const result = await getUserPreferences({
      redisCacheService: redisCacheService as never,
      userId: 'user-1'
    });

    expect(result).toEqual({});
  });

  it('returns empty preferences when cache lookup is empty', async () => {
    const redisCacheService = {
      get: jest.fn().mockResolvedValue(undefined)
    };

    const result = await getUserPreferences({
      redisCacheService: redisCacheService as never,
      userId: 'user-1'
    });

    expect(result).toEqual({});
  });
});
