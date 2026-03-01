import { DataSource } from '@prisma/client';

import { AiService } from './ai.service';

describe('AiService', () => {
  let accountService: { createAccount: jest.Mock; getAccounts: jest.Mock };
  let benchmarkService: { getBenchmarks: jest.Mock };
  let dataProviderService: {
    getAssetProfiles: jest.Mock;
    getHistorical: jest.Mock;
    getQuotes: jest.Mock;
  };
  let exchangeRateDataService: { toCurrency: jest.Mock };
  let orderService: { createOrder: jest.Mock; getOrders: jest.Mock };
  let portfolioService: { getDetails: jest.Mock };
  let prismaService: {
    brokerStatementImport: { findMany: jest.Mock };
    reconciliationRun: { findMany: jest.Mock };
    symbolMapping: { count: jest.Mock; findMany: jest.Mock };
  };
  let propertyService: { getByKey: jest.Mock };
  let aiAgentWebSearchService: { searchStockNews: jest.Mock };
  let redisCacheService: { get: jest.Mock; set: jest.Mock };
  let aiObservabilityService: {
    captureChatFailure: jest.Mock;
    captureChatSuccess: jest.Mock;
    recordLlmInvocation: jest.Mock;
    recordFeedback: jest.Mock;
  };
  let subject: AiService;
  const originalFetch = global.fetch;
  const originalMinimaxApiKey = process.env.minimax_api_key;
  const originalMinimaxModel = process.env.minimax_model;
  const originalOpenAiApiKey = process.env.openai_api_key;
  const originalOpenAiModel = process.env.openai_model;
  const originalOpenAiApiKeyUpper = process.env.OPENAI_API_KEY;
  const originalOpenAiModelUpper = process.env.OPENAI_MODEL;
  const originalZAiGlmApiKey = process.env.z_ai_glm_api_key;
  const originalZAiGlmModel = process.env.z_ai_glm_model;

  beforeEach(() => {
    accountService = {
      createAccount: jest.fn(),
      getAccounts: jest.fn()
    };
    benchmarkService = {
      getBenchmarks: jest.fn()
    };
    dataProviderService = {
      getAssetProfiles: jest.fn(),
      getHistorical: jest.fn(),
      getQuotes: jest.fn()
    };
    exchangeRateDataService = {
      toCurrency: jest.fn()
    };
    orderService = {
      createOrder: jest.fn(),
      getOrders: jest.fn()
    };
    portfolioService = {
      getDetails: jest.fn()
    };
    prismaService = {
      brokerStatementImport: {
        findMany: jest.fn().mockResolvedValue([])
      },
      reconciliationRun: {
        findMany: jest.fn().mockResolvedValue([])
      },
      symbolMapping: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    propertyService = {
      getByKey: jest.fn()
    };
    redisCacheService = {
      get: jest.fn(),
      set: jest.fn()
    };
    aiAgentWebSearchService = {
      searchStockNews: jest.fn()
    };
    aiObservabilityService = {
      captureChatFailure: jest.fn().mockResolvedValue(undefined),
      captureChatSuccess: jest.fn().mockResolvedValue({
        latencyBreakdownInMs: {
          llmGenerationInMs: 9,
          memoryReadInMs: 2,
          memoryWriteInMs: 3,
          toolExecutionInMs: 7
        },
        latencyInMs: 21,
        tokenEstimate: {
          input: 10,
          output: 20,
          total: 30
        },
        traceId: 'trace-1'
      }),
      recordLlmInvocation: jest.fn().mockResolvedValue(undefined),
      recordFeedback: jest.fn()
    };

    subject = new AiService(
      accountService as never,
      benchmarkService as never,
      dataProviderService as never,
      exchangeRateDataService as never,
      orderService as never,
      portfolioService as never,
      prismaService as never,
      propertyService as never,
      redisCacheService as never,
      aiObservabilityService as never,
      aiAgentWebSearchService as never
    );

    delete process.env.minimax_api_key;
    delete process.env.minimax_model;
    delete process.env.openai_api_key;
    delete process.env.openai_model;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.z_ai_glm_api_key;
    delete process.env.z_ai_glm_model;

    accountService.getAccounts.mockResolvedValue([]);
    benchmarkService.getBenchmarks.mockResolvedValue([]);
    dataProviderService.getHistorical.mockResolvedValue({});
    exchangeRateDataService.toCurrency.mockReturnValue(1);
  });

  afterAll(() => {
    global.fetch = originalFetch;

    if (originalMinimaxApiKey === undefined) {
      delete process.env.minimax_api_key;
    } else {
      process.env.minimax_api_key = originalMinimaxApiKey;
    }

    if (originalMinimaxModel === undefined) {
      delete process.env.minimax_model;
    } else {
      process.env.minimax_model = originalMinimaxModel;
    }

    if (originalOpenAiApiKey === undefined) {
      delete process.env.openai_api_key;
    } else {
      process.env.openai_api_key = originalOpenAiApiKey;
    }

    if (originalOpenAiModel === undefined) {
      delete process.env.openai_model;
    } else {
      process.env.openai_model = originalOpenAiModel;
    }

    if (originalOpenAiApiKeyUpper === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKeyUpper;
    }

    if (originalOpenAiModelUpper === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalOpenAiModelUpper;
    }

    if (originalZAiGlmApiKey === undefined) {
      delete process.env.z_ai_glm_api_key;
    } else {
      process.env.z_ai_glm_api_key = originalZAiGlmApiKey;
    }

    if (originalZAiGlmModel === undefined) {
      delete process.env.z_ai_glm_model;
    } else {
      process.env.z_ai_glm_model = originalZAiGlmModel;
    }
  });

  it('runs portfolio, risk, and market tools with structured response fields', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.6,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 6000
        },
        MSFT: {
          allocationInPercentage: 0.4,
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT',
          valueInBaseCurrency: 4000
        }
      }
    });
    dataProviderService.getQuotes.mockResolvedValue({
      AAPL: {
        currency: 'USD',
        marketPrice: 210.12,
        marketState: 'REGULAR'
      },
      MSFT: {
        currency: 'USD',
        marketPrice: 455.9,
        marketState: 'REGULAR'
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'Portfolio risk is medium with top holding at 60% and HHI at 0.52 today.'
    } as never);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Analyze my portfolio risk and price for AAPL',
      sessionId: 'session-1',
      userCurrency: 'USD',
      userId: 'user-1'
    });

    expect(result.answer).toContain('Portfolio risk');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'portfolio_analysis'
        }),
        expect.objectContaining({
          status: 'success',
          tool: 'risk_assessment'
        }),
        expect.objectContaining({
          status: 'success',
          tool: 'market_data_lookup'
        })
      ])
    );
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence.score).toBeLessThanOrEqual(1);
    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ check: 'numerical_consistency' }),
        expect.objectContaining({ check: 'tool_execution' }),
        expect.objectContaining({ check: 'output_completeness' }),
        expect.objectContaining({ check: 'citation_coverage' })
      ])
    );
    expect(result.memory).toEqual({
      sessionId: 'session-1',
      turns: 1
    });
    expect(result.observability).toEqual({
      latencyBreakdownInMs: {
        llmGenerationInMs: 9,
        memoryReadInMs: 2,
        memoryWriteInMs: 3,
        toolExecutionInMs: 7
      },
      latencyInMs: 21,
      tokenEstimate: {
        input: 10,
        output: 20,
        total: 30
      },
      traceId: 'trace-1'
    });
    expect(aiObservabilityService.captureChatSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        latencyBreakdownInMs: expect.objectContaining({
          llmGenerationInMs: expect.any(Number),
          memoryReadInMs: expect.any(Number),
          memoryWriteInMs: expect.any(Number),
          toolExecutionInMs: expect.any(Number)
        })
      })
    );
    expect(redisCacheService.set).toHaveBeenCalledWith(
      'ai-agent-memory-user-1-session-1',
      expect.any(String),
      expect.any(Number)
    );
  });

  it('fails fast on startup when no AI provider is configured', async () => {
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalOpenRouterApiKey = process.env.API_KEY_OPENROUTER;

    delete process.env.JEST_WORKER_ID;
    process.env.NODE_ENV = 'development';
    delete process.env.minimax_api_key;
    delete process.env.minimax_model;
    delete process.env.openai_api_key;
    delete process.env.openai_model;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.z_ai_glm_api_key;
    delete process.env.z_ai_glm_model;
    delete process.env.API_KEY_OPENROUTER;
    propertyService.getByKey.mockResolvedValue(undefined);

    await expect(subject.onModuleInit()).rejects.toThrow(
      'No AI provider configured (startup health check failed'
    );

    if (originalJestWorkerId === undefined) {
      delete process.env.JEST_WORKER_ID;
    } else {
      process.env.JEST_WORKER_ID = originalJestWorkerId;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalOpenRouterApiKey === undefined) {
      delete process.env.API_KEY_OPENROUTER;
    } else {
      process.env.API_KEY_OPENROUTER = originalOpenRouterApiKey;
    }
  });

  it('fails fast when request userId is missing', async () => {
    await expect(
      subject.chat({
        languageCode: 'en',
        query: 'Analyze my portfolio',
        sessionId: 'session-missing-user',
        userCurrency: 'USD'
      } as never)
    ).rejects.toThrow('MISSING_USER_ID');
  });

  it('uses conversationId when resolving and storing memory', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {}
    });
    redisCacheService.get.mockResolvedValue(undefined);
    redisCacheService.set.mockResolvedValue(undefined);

    const result = await subject.chat({
      languageCode: 'en',
      conversationId: 'conversation-123',
      query: 'hey there',
      userCurrency: 'USD',
      userId: 'user-1'
    });

    expect(redisCacheService.get).toHaveBeenCalledWith(
      'ai-agent-memory-user-1-conversation-123'
    );
    expect(redisCacheService.get).toHaveBeenCalledWith(
      'ai-agent-preferences-user-1'
    );
    expect(redisCacheService.set).toHaveBeenCalledWith(
      'ai-agent-memory-user-1-conversation-123',
      expect.any(String),
      expect.any(Number)
    );
    expect(result.memory.sessionId).toBe('conversation-123');
  });

  it('keeps memory history and caps turns at the configured limit', async () => {
    const previousTurns = Array.from({ length: 10 }, (_, index) => {
      return {
        answer: `answer-${index}`,
        query: `query-${index}`,
        timestamp: `2026-02-20T00:0${index}:00.000Z`,
        toolCalls: [{ status: 'success', tool: 'portfolio_analysis' }]
      };
    });

    portfolioService.getDetails.mockResolvedValue({
      holdings: {}
    });
    redisCacheService.get.mockResolvedValue(
      JSON.stringify({
        turns: previousTurns
      })
    );
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Show my portfolio overview',
      sessionId: 'session-memory',
      userCurrency: 'USD',
      userId: 'user-memory'
    });

    expect(result.memory.turns).toBe(10);
    const memoryWriteCall = redisCacheService.set.mock.calls.find(([key]) => {
      return (
        typeof key === 'string' &&
        key.startsWith('ai-agent-memory-user-memory-session-memory')
      );
    });
    expect(memoryWriteCall).toBeDefined();
    const [, payload] = memoryWriteCall as [string, string];
    const persistedMemory = JSON.parse(payload as string);
    expect(persistedMemory.turns).toHaveLength(10);
    expect(
      persistedMemory.turns.find(
        ({ query }: { query: string }) => query === 'query-0'
      )
    ).toBeUndefined();
  });

  it('returns friendly direct greeting response without tools', async () => {
    redisCacheService.get.mockResolvedValue(undefined);
    const generateTextSpy = jest.spyOn(subject, 'generateText');

    const result = await subject.chat({
      languageCode: 'en',
      query: 'hey there',
      sessionId: 'session-direct-route',
      symbols: ['NVDA'],
      userCurrency: 'USD',
      userId: 'user-direct-route'
    });

    expect(result.answer).toContain('How can I help with your finances today?');
    expect(result.toolCalls).toEqual([]);
    expect(result.citations).toEqual([]);
    expect(dataProviderService.getQuotes).not.toHaveBeenCalled();
    expect(generateTextSpy).not.toHaveBeenCalled();
    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'numerical_consistency',
          status: 'passed'
        }),
        expect.objectContaining({
          check: 'policy_gating',
          status: 'passed'
        })
      ])
    );
    expect(result.confidence.band).toBe('medium');
    expect(result.confidence.score).toBeGreaterThanOrEqual(0.7);
  });

  it('returns arithmetic response on direct no-tool arithmetic query', async () => {
    redisCacheService.get.mockResolvedValue(undefined);
    const generateTextSpy = jest.spyOn(subject, 'generateText');

    const result = await subject.chat({
      languageCode: 'en',
      query: '2+2',
      sessionId: 'session-arithmetic-route',
      userCurrency: 'USD',
      userId: 'user-arithmetic-route'
    });

    expect(result.answer).toBe('2+2 = 4');
    expect(result.toolCalls).toEqual([]);
    expect(generateTextSpy).not.toHaveBeenCalled();
    expect(result.confidence).toEqual({
      band: 'high',
      score: 0.95
    });
  });

  it('uses portfolio data for "how much money i have?" queries', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.6,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 6000
        },
        MSFT: {
          allocationInPercentage: 0.4,
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT',
          valueInBaseCurrency: 4000
        }
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'how much money i have?',
      sessionId: 'session-total-value',
      userCurrency: 'USD',
      userId: 'user-total-value'
    });

    expect(result.answer).toContain('Total portfolio value: 10000.00 USD');
    expect(result.answer).not.toContain('I am Ghostfolio AI');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'portfolio_analysis'
        })
      ])
    );
  });

  it('uses portfolio data for typo portfolio-value queries', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.6,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 6000
        },
        MSFT: {
          allocationInPercentage: 0.4,
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT',
          valueInBaseCurrency: 4000
        }
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'how much.i ahve money?',
      sessionId: 'session-total-value-typo',
      userCurrency: 'USD',
      userId: 'user-total-value-typo'
    });

    expect(result.answer).toContain('Total portfolio value: 10000.00 USD');
    expect(result.answer).not.toContain('I am Ghostfolio AI');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'portfolio_analysis'
        })
      ])
    );
  });

  it('routes ambiguous action follow-up query through recommendation tools when finance memory exists', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        USD: {
          allocationInPercentage: 0.665,
          dataSource: DataSource.MANUAL,
          symbol: 'USD',
          valueInBaseCurrency: 6650
        },
        VTI: {
          allocationInPercentage: 0.159,
          dataSource: DataSource.YAHOO,
          symbol: 'VTI',
          valueInBaseCurrency: 1590
        },
        AAPL: {
          allocationInPercentage: 0.085,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 850
        }
      }
    });
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (key.startsWith('ai-agent-memory-user-follow-up-')) {
        return JSON.stringify({
          turns: [
            {
              answer:
                'Risk concentration is high. Top holding allocation is 66.5%.',
              query: 'help me diversify',
              timestamp: '2026-02-24T12:00:00.000Z',
              toolCalls: [
                { status: 'success', tool: 'portfolio_analysis' },
                { status: 'success', tool: 'risk_assessment' }
              ]
            }
          ]
        });
      }

      return undefined;
    });
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'Improve concentration by redirecting new cash to underweight holdings, trimming the top position in stages, and reassessing risk after each rebalance checkpoint.'
    } as never);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'what can i do?',
      sessionId: 'session-follow-up',
      userCurrency: 'USD',
      userId: 'user-follow-up'
    });

    expect(result.answer).toContain('Option 1 (new money first):');
    expect(result.answer).toContain('Option 2 (sell and rebalance):');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'portfolio_analysis'
        }),
        expect.objectContaining({
          status: 'success',
          tool: 'risk_assessment'
        })
      ])
    );
    expect(subject.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Recommendation context (JSON):')
      })
    );
  });

  it('reuses previous successful tools for short follow-up why-queries', async () => {
    orderService.getOrders.mockResolvedValue({
      activities: [
        {
          SymbolProfile: { symbol: 'AAPL' },
          date: new Date('2026-02-20T00:00:00.000Z'),
          symbolProfileId: 'symbol-profile-aapl',
          type: 'BUY',
          valueInBaseCurrency: 1200.5
        }
      ],
      count: 1
    });
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (key === 'ai-agent-memory-user-follow-up-why-session-follow-up-why') {
        return JSON.stringify({
          turns: [
            {
              answer: 'Recent transactions: BUY AAPL 1200.50 USD.',
              query: 'Show my recent transactions',
              timestamp: '2026-02-24T18:40:00.000Z',
              toolCalls: [
                { status: 'success', tool: 'get_recent_transactions' }
              ]
            }
          ]
        });
      }

      return undefined;
    });
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'why?',
      sessionId: 'session-follow-up-why',
      userCurrency: 'USD',
      userId: 'user-follow-up-why'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_recent_transactions'
        })
      ])
    );
    expect(result.answer).toContain('Recent transactions:');
    expect(result.answer).not.toContain('I am Ghostfolio AI');
  });

  it('reuses prior tool context for conversational pronoun follow-ups', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        USD: {
          allocationInPercentage: 1,
          dataSource: DataSource.MANUAL,
          symbol: 'USD',
          valueInBaseCurrency: 1000
        }
      }
    });
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (
        key ===
        'ai-agent-memory-user-follow-up-pronoun-session-follow-up-pronoun'
      ) {
        return JSON.stringify({
          turns: [
            {
              answer: 'Top holding is concentrated in USD.',
              context: {
                entities: ['usd'],
                goalType: 'analyze',
                primaryScope: 'portfolio'
              },
              query: 'lets talk about my portfolio',
              timestamp: new Date().toISOString(),
              toolCalls: [
                { status: 'success', tool: 'portfolio_analysis' },
                { status: 'success', tool: 'risk_assessment' }
              ]
            }
          ]
        });
      }

      return undefined;
    });
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'should i split those?',
      sessionId: 'session-follow-up-pronoun',
      userCurrency: 'USD',
      userId: 'user-follow-up-pronoun'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'portfolio_analysis'
        }),
        expect.objectContaining({
          status: 'success',
          tool: 'risk_assessment'
        })
      ])
    );
    expect(result.answer).toContain('Total portfolio value: 1000.00 USD');
  });

  it('uses freshness breaker to prefer live market/news tools for fresh follow-ups', async () => {
    dataProviderService.getQuotes.mockResolvedValue({});
    aiAgentWebSearchService.searchStockNews.mockResolvedValue({
      results: [],
      success: true
    });
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (
        key === 'ai-agent-memory-user-follow-up-fresh-session-follow-up-fresh'
      ) {
        return JSON.stringify({
          turns: [
            {
              answer: 'Previous market and risk snapshot.',
              query: 'Analyze risk and market news for NVDA',
              timestamp: '2026-02-24T18:40:00.000Z',
              toolCalls: [
                { status: 'success', tool: 'risk_assessment' },
                { status: 'success', tool: 'market_data_lookup' },
                { status: 'success', tool: 'get_financial_news' }
              ]
            }
          ]
        });
      }

      return undefined;
    });
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'what about that latest?',
      sessionId: 'session-follow-up-fresh',
      userCurrency: 'USD',
      userId: 'user-follow-up-fresh'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'market_data_lookup' }),
        expect.objectContaining({ tool: 'get_financial_news' })
      ])
    );
    expect(result.toolCalls).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ tool: 'risk_assessment' })
      ])
    );
  });

  it('explains prior domain refusal when user asks why not', async () => {
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (
        key ===
        'ai-agent-memory-user-follow-up-domain-refusal-session-domain-refusal'
      ) {
        return JSON.stringify({
          turns: [
            {
              answer:
                'I cannot help with medical issues. I can help with portfolio, tax, FIRE, and market questions.',
              query: 'can you diagnose this symptom?',
              timestamp: new Date().toISOString(),
              toolCalls: []
            }
          ]
        });
      }

      return undefined;
    });

    const result = await subject.chat({
      languageCode: 'en',
      query: 'why not?',
      sessionId: 'session-domain-refusal',
      userCurrency: 'USD',
      userId: 'user-follow-up-domain-refusal'
    });

    expect(result.toolCalls).toEqual([]);
    expect(result.answer).toContain('limited to finance');
    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'history_follow_up',
          status: 'passed'
        })
      ])
    );
  });

  it('does not treat clear new requests as follow-up-only after a refusal', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        VTI: {
          allocationInPercentage: 0.7,
          dataSource: DataSource.YAHOO,
          symbol: 'VTI',
          valueInBaseCurrency: 7000
        },
        VXUS: {
          allocationInPercentage: 0.3,
          dataSource: DataSource.YAHOO,
          symbol: 'VXUS',
          valueInBaseCurrency: 3000
        }
      }
    });
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (
        key ===
        'ai-agent-memory-user-new-intent-after-refusal-session-new-intent-after-refusal'
      ) {
        return JSON.stringify({
          turns: [
            {
              answer:
                'I cannot help with medical issues. I can help with portfolio, tax, FIRE, and market questions.',
              query: 'can you diagnose this symptom?',
              timestamp: new Date().toISOString(),
              toolCalls: []
            }
          ]
        });
      }

      return undefined;
    });
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'analyze my etf allocation',
      sessionId: 'session-new-intent-after-refusal',
      userCurrency: 'USD',
      userId: 'user-new-intent-after-refusal'
    });

    expect(result.answer).not.toContain('limited to finance');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'portfolio_analysis'
        })
      ])
    );
  });

  it('treats "anything else?" as contextual continuation after identity reply', async () => {
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (
        key ===
        'ai-agent-memory-user-follow-up-anything-else-session-anything-else'
      ) {
        return JSON.stringify({
          turns: [
            {
              answer:
                'I am Ghostfolio AI, your portfolio copilot for this account.\nTry one of these:\n- "Show me my portfolio allocation"',
              query: 'who are you?',
              timestamp: new Date().toISOString(),
              toolCalls: []
            }
          ]
        });
      }

      return undefined;
    });

    const result = await subject.chat({
      languageCode: 'en',
      query: 'anything else?',
      sessionId: 'session-anything-else',
      userCurrency: 'USD',
      userId: 'user-follow-up-anything-else'
    });

    expect(result.toolCalls).toEqual([]);
    expect(result.answer).toContain(
      'I can continue with your current chat context'
    );
    expect(result.answer).not.toContain('Insufficient confidence');
    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'history_follow_up',
          status: 'passed'
        })
      ])
    );
  });

  it('returns targeted clarification for short follow-up queries without prior context', async () => {
    redisCacheService.get.mockResolvedValue(undefined);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'why?',
      sessionId: 'session-follow-up-no-context',
      userCurrency: 'USD',
      userId: 'user-follow-up-no-context'
    });

    expect(result.toolCalls).toEqual([]);
    expect(result.answer).toContain('I can explain the previous result');
  });

  it('returns conversational acknowledgment for short non-finance reactions after context', async () => {
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (key === 'ai-agent-memory-user-ack-reaction-session-ack-reaction') {
        return JSON.stringify({
          turns: [
            {
              answer:
                'Portfolio snapshot:\nTotal portfolio value: 10000.00 USD.\nLargest allocations: AAPL 40.00%, MSFT 35.00%, NVDA 25.00%.',
              query: 'top 5 stocks now?',
              timestamp: new Date().toISOString(),
              toolCalls: [{ status: 'success', tool: 'get_current_holdings' }]
            }
          ]
        });
      }

      return undefined;
    });
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: "oh wow that's a lot",
      sessionId: 'session-ack-reaction',
      userCurrency: 'USD',
      userId: 'user-ack-reaction'
    });

    expect(result.toolCalls).toEqual([]);
    expect(result.answer).toContain('Glad that helps!');
    expect(result.answer).not.toContain('Insufficient confidence');
  });

  it('uses llm history fallback for ambiguous non-portfolio follow-ups', async () => {
    redisCacheService.get.mockImplementation(async (key: string) => {
      if (key === 'ai-agent-memory-user-clarify-math-session-clarify-math') {
        return JSON.stringify({
          turns: [
            {
              answer: '2+2 = 4',
              query: '2+2=4?',
              timestamp: new Date().toISOString(),
              toolCalls: []
            }
          ]
        });
      }

      return undefined;
    });
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'Do you want me to explain the math result?'
    } as never);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'this is weird',
      sessionId: 'session-clarify-math',
      userCurrency: 'USD',
      userId: 'user-clarify-math'
    });

    expect(result.toolCalls).toEqual([]);
    expect(result.answer).toBe('Do you want me to explain the math result?');
    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'clarify_llm_fallback',
          status: 'passed'
        })
      ])
    );
  });

  it('persists and recalls cross-session user preferences for the same user', async () => {
    const redisStore = new Map<string, string>();
    redisCacheService.get.mockImplementation(async (key: string) => {
      return redisStore.get(key);
    });
    redisCacheService.set.mockImplementation(
      async (key: string, value: string) => {
        redisStore.set(key, value);
      }
    );

    const savePreferenceResult = await subject.chat({
      languageCode: 'en',
      query: 'Remember to keep responses concise.',
      sessionId: 'session-pref-1',
      userCurrency: 'USD',
      userId: 'user-pref'
    });

    expect(savePreferenceResult.answer).toContain('Saved preference');
    expect(redisStore.get('ai-agent-preferences-user-pref')).toContain(
      'concise'
    );

    const recallPreferenceResult = await subject.chat({
      languageCode: 'en',
      query: 'What do you remember about me?',
      sessionId: 'session-pref-2',
      userCurrency: 'USD',
      userId: 'user-pref'
    });

    expect(recallPreferenceResult.answer).toContain(
      'Saved cross-session preferences'
    );
    expect(recallPreferenceResult.answer).toContain('response style: concise');
  });

  it('applies persisted response-style preferences to LLM prompt generation', async () => {
    const redisStore = new Map<string, string>();
    redisCacheService.get.mockImplementation(async (key: string) => {
      return redisStore.get(key);
    });
    redisCacheService.set.mockImplementation(
      async (key: string, value: string) => {
        redisStore.set(key, value);
      }
    );
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 1,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 1000
        }
      }
    });
    const generateTextSpy = jest.spyOn(subject, 'generateText');
    generateTextSpy.mockResolvedValue({
      text: 'Portfolio concentration is high.'
    } as never);

    await subject.chat({
      languageCode: 'en',
      query: 'Keep responses concise.',
      sessionId: 'session-pref-tools-1',
      userCurrency: 'USD',
      userId: 'user-pref-tools'
    });

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Analyze my portfolio risk and suggest diversification actions',
      sessionId: 'session-pref-tools-2',
      userCurrency: 'USD',
      userId: 'user-pref-tools'
    });

    expect(result.answer.length).toBeGreaterThan(0);
    expect(generateTextSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'User preference: keep the response concise in 1-3 short sentences and avoid speculation.'
        )
      })
    );
  });

  it('runs rebalance and stress test tools for portfolio scenario prompts', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.6,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 6000
        },
        MSFT: {
          allocationInPercentage: 0.4,
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT',
          valueInBaseCurrency: 4000
        }
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'Trim AAPL toward target allocation and monitor stress drawdown.'
    } as never);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Rebalance my portfolio and run a stress test',
      sessionId: 'session-core-tools',
      userCurrency: 'USD',
      userId: 'user-core-tools'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'portfolio_analysis' }),
        expect.objectContaining({ tool: 'risk_assessment' }),
        expect.objectContaining({ tool: 'stress_test' })
      ])
    );
    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'stress_test_coherence',
          status: 'passed'
        })
      ])
    );
    expect(
      portfolioService.getDetails.mock.calls.length
    ).toBeGreaterThanOrEqual(1);
  });

  it('returns deterministic diversification action guidance when generated output is unreliable', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.665,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 6650
        },
        VTI: {
          allocationInPercentage: 0.159,
          dataSource: DataSource.YAHOO,
          symbol: 'VTI',
          valueInBaseCurrency: 1590
        },
        MSFT: {
          allocationInPercentage: 0.085,
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT',
          valueInBaseCurrency: 850
        }
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'Diversify.'
    } as never);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'help me diversify',
      sessionId: 'session-diversify-1',
      userCurrency: 'USD',
      userId: 'user-diversify-1'
    });

    expect(result.answer).toContain('AAPL');
    expect(result.answer).toContain('Option 1 (new money first):');
    expect(result.answer).toContain('Option 2 (sell and rebalance):');
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'portfolio_analysis' }),
        expect.objectContaining({ tool: 'risk_assessment' })
      ])
    );
  });

  it('returns graceful failure metadata when a tool execution fails', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {}
    });
    dataProviderService.getQuotes.mockRejectedValue(
      new Error('market provider unavailable')
    );
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'Market data currently has limited availability with 0 quotes returned for the requested symbols.'
    } as never);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'What is the current price of NVDA?',
      sessionId: 'session-failure',
      userCurrency: 'USD',
      userId: 'user-failure'
    });

    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        outputSummary: 'market provider unavailable',
        status: 'failed',
        tool: 'market_data_lookup'
      })
    ]);
    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'numerical_consistency',
          status: 'warning'
        }),
        expect.objectContaining({
          check: 'tool_execution',
          status: 'warning'
        }),
        expect.objectContaining({
          check: 'confidence_guardrail',
          status: 'warning'
        }),
        expect.objectContaining({
          check: 'human_in_the_loop',
          status: 'warning'
        })
      ])
    );
    expect(result.answer).toContain(
      'Insufficient confidence to complete this scoped request with the current evidence.'
    );
    expect(result.answer).toContain(
      'The required tool checks failed (market_data_lookup).'
    );
    expect(result.answer).toContain('Escalation:');
    expect(result.escalation).toEqual(
      expect.objectContaining({
        required: true
      })
    );
  });

  it('returns abstain response when tool route has low confidence and no successful tool evidence', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {}
    });
    dataProviderService.getQuotes.mockRejectedValue(
      new Error('market provider unavailable')
    );
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'As an AI, I cannot provide financial advice.'
    } as never);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'What is the current price of NVDA?',
      sessionId: 'session-low-confidence-tools',
      userCurrency: 'USD',
      userId: 'user-low-confidence-tools'
    });

    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        outputSummary: 'market provider unavailable',
        status: 'failed',
        tool: 'market_data_lookup'
      })
    ]);
    expect(result.answer).toContain(
      'Insufficient confidence to complete this scoped request with the current evidence.'
    );
    expect(result.answer).toContain(
      'The required tool checks failed (market_data_lookup).'
    );
    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'confidence_guardrail',
          status: 'warning'
        }),
        expect.objectContaining({
          check: 'human_in_the_loop',
          status: 'warning'
        })
      ])
    );
    expect(result.confidence.band).toBe('low');
    expect(result.answer).toContain('Escalation:');
    expect(result.escalation).toEqual(
      expect.objectContaining({
        required: true
      })
    );
  });

  it('keeps fundamentals requests user-facing when portfolio lookup fails for top-N stock phrasing', async () => {
    portfolioService.getDetails.mockRejectedValue(
      new Error('portfolio service unavailable')
    );
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'fundamentals on top 5 stock',
      sessionId: 'session-top-five-fundamentals-fallback',
      userCurrency: 'USD',
      userId: 'user-top-five-fundamentals-fallback'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_asset_fundamentals'
        })
      ])
    );
    expect(result.answer).toContain(
      'Fundamentals request completed with limited profile coverage.'
    );
    expect(result.answer).not.toContain(
      'Insufficient confidence to answer safely with the current evidence.'
    );
    expect(result.answer).not.toContain('Escalation:');
  });

  it('flags numerical consistency warning when allocation sum exceeds tolerance', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.8,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 8000
        },
        MSFT: {
          allocationInPercentage: 0.3,
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT',
          valueInBaseCurrency: 3000
        }
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Show portfolio allocation',
      sessionId: 'session-allocation-warning',
      userCurrency: 'USD',
      userId: 'user-allocation-warning'
    });

    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'numerical_consistency',
          status: 'warning'
        })
      ])
    );
  });

  it('flags market data coverage warning when only part of symbols resolve', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {}
    });
    dataProviderService.getQuotes.mockResolvedValue({
      AAPL: {
        currency: 'USD',
        marketPrice: 210.12,
        marketState: 'REGULAR'
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'Partial market data was returned.'
    } as never);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Get market prices for AAPL and TSLA',
      sessionId: 'session-market-coverage-warning',
      symbols: ['AAPL', 'TSLA'],
      userCurrency: 'USD',
      userId: 'user-market-coverage-warning'
    });

    expect(result.verification).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'market_data_coverage',
          status: 'warning'
        })
      ])
    );
  });

  it('returns expanded capability suggestions for what can you do queries', async () => {
    redisCacheService.get.mockResolvedValue(undefined);

    const result = await subject.chat({
      languageCode: 'en',
      query: 'What can you do?',
      sessionId: 'session-capability',
      userCurrency: 'USD',
      userId: 'user-capability'
    });

    expect(result.answer).toContain('What you can ask me:');
    expect(result.answer).toContain('How do I place a test order?');
    expect(result.toolCalls).toEqual([]);
  });

  it('executes recent transaction tool and returns structured summary', async () => {
    orderService.getOrders.mockResolvedValue({
      activities: [
        {
          SymbolProfile: { symbol: 'AAPL' },
          date: new Date('2026-02-20T00:00:00.000Z'),
          symbolProfileId: 'symbol-profile-aapl',
          type: 'BUY',
          valueInBaseCurrency: 1200.5
        },
        {
          SymbolProfile: { symbol: 'MSFT' },
          date: new Date('2026-02-18T00:00:00.000Z'),
          symbolProfileId: 'symbol-profile-msft',
          type: 'SELL',
          valueInBaseCurrency: 800.25
        }
      ],
      count: 2
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Show my recent transactions',
      sessionId: 'session-transactions',
      userCurrency: 'USD',
      userId: 'user-transactions'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_recent_transactions'
        })
      ])
    );
    expect(result.answer).toContain('Recent transactions:');
  });

  it('returns a friendly empty-transactions message when no transactions exist', async () => {
    orderService.getOrders.mockResolvedValue({
      activities: [],
      count: 0
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Show my recent transactions',
      sessionId: 'session-transactions-none',
      userCurrency: 'USD',
      userId: 'user-transactions-none'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_recent_transactions'
        })
      ])
    );
    expect(result.answer).toContain(
      "I don't have any recorded transactions yet for this account."
    );
  });

  it('executes fundamentals and trade impact tools for explicit analysis queries', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.6,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 6000
        },
        MSFT: {
          allocationInPercentage: 0.4,
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT',
          valueInBaseCurrency: 4000
        }
      }
    });
    dataProviderService.getAssetProfiles.mockResolvedValue({
      AAPL: {
        assetClass: 'EQUITY',
        countries: [{ code: 'US', weight: 1 }],
        name: 'Apple Inc.',
        sectors: [{ name: 'Technology', weight: 1 }]
      }
    });
    dataProviderService.getQuotes.mockResolvedValue({});
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const fundamentalsResult = await subject.chat({
      languageCode: 'en',
      query: 'Get fundamentals for AAPL',
      sessionId: 'session-fundamentals',
      userCurrency: 'USD',
      userId: 'user-fundamentals'
    });

    expect(fundamentalsResult.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_asset_fundamentals'
        })
      ])
    );
    expect(fundamentalsResult.answer).toContain('Fundamental analysis:');
    expect(fundamentalsResult.answer).toContain('AAPL — Apple Inc. (EQUITY)');
    expect(fundamentalsResult.answer).toContain('Sectors: Technology 100.0%');
    expect(fundamentalsResult.answer).toContain('Portfolio exposure: 60.0%');

    const typoFundamentalsResult = await subject.chat({
      languageCode: 'en',
      query: 'wfundamentals on tesla stock?',
      sessionId: 'session-fundamentals-typo',
      userCurrency: 'USD',
      userId: 'user-fundamentals'
    });

    expect(typoFundamentalsResult.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_asset_fundamentals'
        })
      ])
    );
    expect(typoFundamentalsResult.answer).toContain('Fundamental analysis:');
    expect(typoFundamentalsResult.answer).toContain('Decision use:');

    const tradeImpactResult = await subject.chat({
      languageCode: 'en',
      query: 'Simulate trade impact if I buy 1000 AAPL',
      sessionId: 'session-trade-impact',
      userCurrency: 'USD',
      userId: 'user-trade-impact'
    });

    expect(tradeImpactResult.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'simulate_trade_impact'
        })
      ])
    );
    expect(tradeImpactResult.answer).toContain('Trade impact simulation');
  });

  it('executes transaction categorization, tax estimate, and compliance check tools', async () => {
    orderService.getOrders.mockResolvedValue({
      activities: [
        {
          SymbolProfile: { symbol: 'AAPL' },
          date: new Date('2026-02-20T10:00:00.000Z'),
          symbolProfileId: 'symbol-profile-aapl',
          type: 'BUY',
          valueInBaseCurrency: 2500
        },
        {
          SymbolProfile: { symbol: 'AAPL' },
          date: new Date('2026-02-10T10:00:00.000Z'),
          symbolProfileId: 'symbol-profile-aapl',
          type: 'SELL',
          valueInBaseCurrency: 2000
        },
        {
          SymbolProfile: { symbol: 'MSFT' },
          date: new Date('2026-02-05T10:00:00.000Z'),
          symbolProfileId: 'symbol-profile-msft',
          type: 'BUY',
          valueInBaseCurrency: 1500
        }
      ],
      count: 3
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query:
        'Categorize my transactions by type, estimate tax liability for income 120000 and deductions 20000, and run compliance check',
      sessionId: 'session-ops-tools',
      userCurrency: 'USD',
      userId: 'user-ops-tools'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'transaction_categorize'
        }),
        expect.objectContaining({
          status: 'success',
          tool: 'tax_estimate'
        }),
        expect.objectContaining({
          status: 'success',
          tool: 'compliance_check'
        })
      ])
    );
    expect(result.answer).toContain('Transaction categorization:');
    expect(result.answer).toContain('Tax estimate (assumption-based):');
    expect(result.answer).toContain('Compliance check:');
    expect(orderService.getOrders).toHaveBeenCalledTimes(1);
    expect(orderService.getOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        sortColumn: 'date',
        sortDirection: 'desc',
        take: 100,
        userCurrency: 'USD',
        userId: 'user-ops-tools'
      })
    );
  });

  it('handles partial tax input without crashing and shows inferred assumptions', async () => {
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Estimate my tax liability for income 120000',
      sessionId: 'session-tax-partial',
      userCurrency: 'USD',
      userId: 'user-tax-partial'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'tax_estimate'
        })
      ])
    );
    expect(result.answer).toContain(
      'Tax estimate (assumption-based): income 120000.00 USD, deductions 0.00 USD.'
    );
    expect(result.answer).toContain(
      'Income or deductions were partially inferred'
    );
  });

  it('keeps missing income explicit when only deductions are provided', async () => {
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query:
        'Can you calculate my tax estimate? Deductions are 20000 and tax rate 20%',
      sessionId: 'session-tax-deductions-only',
      userCurrency: 'USD',
      userId: 'user-tax-deductions-only'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'tax_estimate'
        })
      ])
    );
    expect(result.answer).toContain(
      'Tax estimate (assumption-based): income 0.00 USD, deductions 20000.00 USD.'
    );
  });

  it('executes account overview, exchange rate, benchmarks, activity history, and demo data tools', async () => {
    accountService.getAccounts.mockResolvedValue([
      {
        balance: 1500,
        currency: 'USD',
        id: 'account-1',
        name: 'Cash'
      }
    ]);
    exchangeRateDataService.toCurrency.mockReturnValue(0.91);
    benchmarkService.getBenchmarks.mockResolvedValue([
      {
        symbol: 'SPY',
        trend50d: 'UP',
        trend200d: 'UP'
      },
      {
        symbol: 'QQQ',
        trend50d: 'NEUTRAL',
        trend200d: 'UP'
      }
    ]);
    orderService.getOrders.mockResolvedValue({
      activities: [
        {
          SymbolProfile: { symbol: 'AAPL' },
          date: new Date('2026-02-20T00:00:00.000Z'),
          symbolProfileId: 'symbol-profile-aapl',
          type: 'BUY',
          valueInBaseCurrency: 1200.5
        }
      ],
      count: 1
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query:
        'Show account overview, usd to eur exchange rate, benchmark indices, activity history, and demo data',
      sessionId: 'session-new-read-tools',
      userCurrency: 'USD',
      userId: 'user-new-read-tools'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'account_overview'
        }),
        expect.objectContaining({ status: 'success', tool: 'exchange_rate' }),
        expect.objectContaining({
          status: 'success',
          tool: 'market_benchmarks'
        }),
        expect.objectContaining({
          status: 'success',
          tool: 'activity_history'
        }),
        expect.objectContaining({ status: 'success', tool: 'demo_data' })
      ])
    );
    expect(result.answer).toContain('Account overview:');
    expect(result.answer).toContain('Exchange rate snapshot:');
    expect(result.answer).toContain('Market benchmarks:');
    expect(result.answer).toContain('Activity history:');
  });

  it('returns deterministic activity history summary for single-tool activity queries', async () => {
    orderService.getOrders.mockResolvedValue({
      activities: [
        {
          SymbolProfile: { symbol: 'AAPL' },
          date: new Date('2026-02-20T00:00:00.000Z'),
          symbolProfileId: 'symbol-profile-aapl',
          type: 'BUY',
          valueInBaseCurrency: 1200.5
        }
      ],
      count: 1
    });
    redisCacheService.get.mockResolvedValue(undefined);
    const generateTextSpy = jest.spyOn(subject, 'generateText');

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Show my recent activity history',
      sessionId: 'session-activity-deterministic',
      userCurrency: 'USD',
      userId: 'user-activity-deterministic'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'success', tool: 'activity_history' })
      ])
    );
    expect(result.answer).toContain('Activity history: 1 recent entries.');
    expect(generateTextSpy).not.toHaveBeenCalled();
  });

  it('returns deterministic demo data summary for single-tool demo queries', async () => {
    redisCacheService.get.mockResolvedValue(undefined);
    const generateTextSpy = jest.spyOn(subject, 'generateText');

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Show demo data mode summary',
      sessionId: 'session-demo-deterministic',
      userCurrency: 'USD',
      userId: 'user-demo-deterministic'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'success', tool: 'demo_data' })
      ])
    );
    expect(result.answer).toContain('Demo data mode: sample flow includes');
    expect(generateTextSpy).not.toHaveBeenCalled();
  });

  it('creates account and order for explicit action requests', async () => {
    accountService.createAccount.mockResolvedValue({
      balance: 500,
      currency: 'USD',
      id: 'created-account',
      name: 'Trading',
      userId: 'user-create-tools'
    });
    accountService.getAccounts.mockResolvedValue([
      {
        balance: 500,
        currency: 'USD',
        id: 'created-account',
        name: 'Trading'
      }
    ]);
    orderService.createOrder.mockResolvedValue({
      id: 'order-1',
      type: 'BUY'
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query:
        'Create account named Trading with 500 USD and place order for 2 shares of AAPL at 100 USD',
      sessionId: 'session-create-tools',
      userCurrency: 'USD',
      userId: 'user-create-tools'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'success', tool: 'create_account' }),
        expect.objectContaining({ status: 'success', tool: 'create_order' })
      ])
    );
    expect(accountService.createAccount).toHaveBeenCalled();
    expect(orderService.createOrder).toHaveBeenCalled();
  });

  it('creates order from notional amount phrasing using live quote', async () => {
    accountService.getAccounts.mockResolvedValue([
      {
        balance: 5000,
        currency: 'USD',
        id: 'account-1',
        name: 'Trading'
      }
    ]);
    portfolioService.getDetails.mockResolvedValue({
      holdings: {}
    });
    dataProviderService.getQuotes.mockResolvedValue({
      TSLA: {
        currency: 'USD',
        marketPrice: 400,
        marketState: 'REGULAR'
      }
    });
    orderService.createOrder.mockResolvedValue({
      id: 'order-notional-1',
      type: 'BUY'
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Buy 1000 USD of TSLA',
      sessionId: 'session-create-order-notional',
      userCurrency: 'USD',
      userId: 'user-create-order-notional'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'success', tool: 'create_order' })
      ])
    );
    const executedTools = result.toolCalls.map(({ tool }) => tool);
    expect(executedTools).not.toEqual(
      expect.arrayContaining([
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan',
        'market_data_lookup'
      ])
    );
    expect(dataProviderService.getQuotes).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ symbol: 'TSLA' })
        ])
      })
    );

    const createOrderInput = orderService.createOrder.mock.calls[0]?.[0];
    expect(createOrderInput).toMatchObject({
      accountId: 'account-1',
      currency: 'USD',
      type: 'BUY',
      unitPrice: 400,
      updateAccountBalance: false
    });
    expect(createOrderInput.quantity).toBeCloseTo(2.5, 6);
    expect(createOrderInput.SymbolProfile.connectOrCreate.create.symbol).toBe(
      'TSLA'
    );
  });

  it('creates order from quantity-plus-stock wording using live quote', async () => {
    accountService.getAccounts.mockResolvedValue([
      {
        balance: 5000,
        currency: 'USD',
        id: 'account-1',
        name: 'Trading'
      }
    ]);
    dataProviderService.getQuotes.mockResolvedValue({
      TSLA: {
        currency: 'USD',
        marketPrice: 408.58,
        marketState: 'REGULAR'
      }
    });
    orderService.createOrder.mockResolvedValue({
      id: 'order-quantity-stock-1',
      type: 'BUY'
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'buy 10 tesla stocks',
      sessionId: 'session-create-order-quantity-stock',
      userCurrency: 'USD',
      userId: 'user-create-order-quantity-stock'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'success', tool: 'create_order' })
      ])
    );
    const executedTools = result.toolCalls.map(({ tool }) => tool);
    expect(executedTools).not.toEqual(
      expect.arrayContaining([
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan',
        'market_data_lookup'
      ])
    );

    const createOrderInput = orderService.createOrder.mock.calls[0]?.[0];
    expect(createOrderInput).toMatchObject({
      accountId: 'account-1',
      currency: 'USD',
      quantity: 10,
      type: 'BUY',
      unitPrice: 408.58,
      updateAccountBalance: false
    });
    expect(createOrderInput.SymbolProfile.connectOrCreate.create.symbol).toBe(
      'TSLA'
    );
  });

  it('answers holdings follow-up phrasing for symbol quantities', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        TSLA: {
          allocationInPercentage: 0.322,
          dataSource: DataSource.YAHOO,
          quantity: 10,
          symbol: 'TSLA',
          valueInBaseCurrency: 1000
        },
        USD: {
          allocationInPercentage: 0.678,
          dataSource: DataSource.YAHOO,
          quantity: 0,
          symbol: 'USD',
          valueInBaseCurrency: 2105
        }
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'how many tesla stocks i have',
      sessionId: 'session-holdings-follow-up',
      userCurrency: 'USD',
      userId: 'user-holdings-follow-up'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_current_holdings'
        })
      ])
    );
    expect(result.answer.toLowerCase()).not.toContain(
      'insufficient confidence'
    );
  });

  it('handles multiline holdings follow-up when cached analysis lacks quantity field', async () => {
    const cachedPortfolioAnalysisWithoutQuantity = JSON.stringify({
      data: {
        allocationSum: 1,
        holdings: [
          {
            allocationInPercentage: 0.322,
            dataSource: DataSource.YAHOO,
            symbol: 'TSLA',
            valueInBaseCurrency: 1000
          },
          {
            allocationInPercentage: 0.678,
            dataSource: DataSource.YAHOO,
            symbol: 'USD',
            valueInBaseCurrency: 2105
          }
        ],
        holdingsCount: 2,
        totalValueInBaseCurrency: 3105
      },
      updatedAt: new Date().toISOString()
    });

    redisCacheService.get.mockImplementation(async (key: string) => {
      if (key === 'ai:portfolio-analysis:user-holdings-follow-up-cache') {
        return cachedPortfolioAnalysisWithoutQuantity;
      }

      return undefined;
    });
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'how many tesla stocks i\n        have',
      sessionId: 'session-holdings-follow-up-cache',
      userCurrency: 'USD',
      userId: 'user-holdings-follow-up-cache'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_current_holdings'
        })
      ])
    );
    expect(result.answer.toLowerCase()).not.toContain('request failed');
    expect(result.answer.toLowerCase()).not.toContain(
      'insufficient confidence'
    );
  });

  it('adds seed funds for explicit seed funding requests', async () => {
    accountService.getAccounts.mockResolvedValue([
      {
        balance: 500,
        currency: 'USD',
        id: 'account-1',
        name: 'Testing'
      }
    ]);
    orderService.createOrder.mockResolvedValue({
      id: 'order-seed-1',
      type: 'INTEREST'
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Add 1000 USD seed funds for testing',
      sessionId: 'session-seed-funds',
      userCurrency: 'USD',
      userId: 'user-seed-funds'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'success', tool: 'seed_funds' })
      ])
    );

    const createOrderInput = orderService.createOrder.mock.calls[0]?.[0];
    expect(createOrderInput).toMatchObject({
      accountId: 'account-1',
      comment: 'Seed funds added',
      currency: 'USD',
      date: expect.any(Date),
      fee: 0,
      quantity: 1,
      type: 'INTEREST',
      unitPrice: 1000,
      updateAccountBalance: true
    });
    expect(
      createOrderInput.SymbolProfile.connectOrCreate.create.symbol
    ).toMatch(/^GF_SEED_\d+$/);
  });

  it('routes "seed my account ... split ..." phrasing to seed_funds instead of market snapshot tools', async () => {
    accountService.getAccounts.mockResolvedValue([
      {
        balance: 500,
        currency: 'USD',
        id: 'account-1',
        name: 'Testing'
      }
    ]);
    orderService.createOrder.mockResolvedValue({
      id: 'order-seed-2',
      type: 'INTEREST'
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query:
        'seed my account with stocks of apple tesla and goodle split 10000 30% 20% and 50%',
      sessionId: 'session-seed-account-split',
      userCurrency: 'USD',
      userId: 'user-seed-account-split'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'success', tool: 'seed_funds' })
      ])
    );
    expect(result.toolCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'market_data_lookup' })
      ])
    );
    expect(dataProviderService.getQuotes).not.toHaveBeenCalled();
  });

  it.each([
    'top up my account with 1200 usd',
    'add more money to my account 900 usd',
    'put more money in my account 600'
  ])(
    'routes funding wording "%s" to seed_funds without quote lookup',
    async (query) => {
      accountService.getAccounts.mockResolvedValue([
        {
          balance: 500,
          currency: 'USD',
          id: 'account-1',
          name: 'Testing'
        }
      ]);
      orderService.createOrder.mockResolvedValue({
        id: 'order-seed-variant',
        type: 'INTEREST'
      });
      redisCacheService.get.mockResolvedValue(undefined);
      jest
        .spyOn(subject, 'generateText')
        .mockRejectedValue(new Error('offline'));

      const result = await subject.chat({
        languageCode: 'en',
        query,
        sessionId: 'session-seed-variant',
        userCurrency: 'USD',
        userId: 'user-seed-variant'
      });

      expect(result.toolCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'success', tool: 'seed_funds' })
        ])
      );
      expect(result.toolCalls).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tool: 'market_data_lookup' })
        ])
      );
      expect(dataProviderService.getQuotes).not.toHaveBeenCalled();
    }
  );

  it('asks for missing order details for vague order requests', async () => {
    accountService.getAccounts.mockResolvedValue([
      {
        balance: 500,
        currency: 'USD',
        id: 'account-1',
        name: 'Trading'
      }
    ]);
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'make an order for tesla',
      sessionId: 'session-create-order-vague',
      userCurrency: 'USD',
      userId: 'user-create-order-vague'
    });

    expect(result.answer).toContain('please specify the amount');
    expect(result.toolCalls).toEqual([]);
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('returns order-details guidance for order how-to prompts without executing tools', async () => {
    redisCacheService.get.mockResolvedValue(undefined);
    const generateTextSpy = jest
      .spyOn(subject, 'generateText')
      .mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'How can I make an order?',
      sessionId: 'session-create-order-howto',
      userCurrency: 'USD',
      userId: 'user-create-order-howto'
    });

    expect(result.answer).toContain(
      'To create an order, please specify the amount'
    );
    expect(result.toolCalls).toEqual([]);
    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(generateTextSpy).not.toHaveBeenCalled();
  });

  it('does not infer deductions from tax rate when only income is provided', async () => {
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Estimate tax liability for income 120000 at tax rate 20%',
      sessionId: 'session-tax-rate-only',
      userCurrency: 'USD',
      userId: 'user-tax-rate-only'
    });

    expect(result.answer).toContain(
      'Tax estimate (assumption-based): income 120000.00 USD, deductions 0.00 USD.'
    );
  });

  it('returns tax planning checklist when query asks broad tax question without amounts', async () => {
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'what do i need to know this year about taxes',
      sessionId: 'session-tax-checklist',
      userCurrency: 'USD',
      userId: 'user-tax-checklist'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'tax_estimate'
        })
      ])
    );
    expect(result.answer).toContain('Tax planning checklist for this year:');
    expect(result.answer).not.toContain('Price for NVDA');
  });

  it('uses web news search service for financial news', async () => {
    dataProviderService.getAssetProfiles.mockResolvedValue({
      AAPL: {
        name: 'Apple'
      }
    });
    aiAgentWebSearchService.searchStockNews.mockResolvedValue({
      results: [
        {
          link: 'https://example.com/article',
          snippet: 'Apple announced strong guidance.',
          source: 'Apple (AAPL)',
          title: 'Apple reports stronger quarter'
        }
      ],
      success: true
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Show financial news for AAPL',
      sessionId: 'session-financial-news',
      userCurrency: 'USD',
      userId: 'user-financial-news'
    });

    expect(aiAgentWebSearchService.searchStockNews).toHaveBeenCalledWith(
      'AAPL',
      'Apple'
    );
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_financial_news'
        })
      ])
    );
    expect(result.answer).toContain('News brief:');
    expect(result.answer).toContain('Apple (AAPL)');
    expect(result.answer).toContain('Apple reports stronger quarter');
  });

  it('routes freshness-style company prompts to financial news tools', async () => {
    dataProviderService.getAssetProfiles.mockResolvedValue({
      TSLA: {
        name: 'Tesla'
      }
    });
    aiAgentWebSearchService.searchStockNews.mockResolvedValue({
      results: [
        {
          link: 'https://example.com/tesla-news',
          snippet: 'Tesla announced new delivery guidance.',
          source: 'Tesla (TSLA)',
          title: 'Tesla updates delivery outlook'
        }
      ],
      success: true
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'whats new for tesla',
      sessionId: 'session-tesla-news-freshness',
      userCurrency: 'USD',
      userId: 'user-tesla-news-freshness'
    });

    expect(aiAgentWebSearchService.searchStockNews).toHaveBeenCalledWith(
      'TSLA',
      'Tesla'
    );
    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_financial_news'
        })
      ])
    );
    expect(result.answer).toContain('News brief:');
    expect(result.answer).toContain('Tesla (TSLA)');
  });

  it('routes ticker investment queries to market research tools without forcing portfolio context', async () => {
    dataProviderService.getQuotes.mockResolvedValue({
      NVDA: {
        currency: 'USD',
        marketPrice: 192.85,
        marketState: 'REGULAR'
      }
    });
    dataProviderService.getAssetProfiles.mockResolvedValue({
      NVDA: {
        assetClass: 'EQUITY',
        name: 'NVIDIA Corporation',
        sectors: [{ name: 'Technology', weight: 1 }]
      }
    });
    dataProviderService.getHistorical.mockResolvedValue({
      NVDA: {
        '2026-02-01': { marketPrice: 165.2 },
        '2026-02-10': { marketPrice: 181.4 },
        '2026-02-20': { marketPrice: 192.85 }
      }
    });
    aiAgentWebSearchService.searchStockNews.mockResolvedValue({
      results: [
        {
          link: 'https://example.com/nvda-news',
          snippet: 'NVIDIA announced expanded AI data-center partnerships.',
          source: 'NVIDIA',
          title: 'NVIDIA expands AI data-center partnerships'
        }
      ],
      success: true
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Should I invest in NVIDIA right now?',
      sessionId: 'session-nvda-invest',
      userCurrency: 'USD',
      userId: 'user-nvda-invest'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'get_asset_fundamentals' }),
        expect.objectContaining({ tool: 'get_financial_news' }),
        expect.objectContaining({ tool: 'price_history' })
      ])
    );
    expect(result.toolCalls).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ tool: 'portfolio_analysis' }),
        expect.objectContaining({ tool: 'risk_assessment' }),
        expect.objectContaining({ tool: 'rebalance_plan' })
      ])
    );
    expect(portfolioService.getDetails).not.toHaveBeenCalled();
    expect(result.answer).toContain('Fundamental analysis:');
    expect(result.answer).toContain('Price history (NVDA, 30d):');
    expect(result.answer).toContain('News catalysts (latest):');
    expect(result.answer).not.toContain('Risk concentration is');
    expect(result.answer).not.toContain('Total portfolio value:');
  });

  it('routes FIRE retirement queries to FIRE analysis tool', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        SPY: {
          allocationInPercentage: 0.7,
          dataSource: DataSource.YAHOO,
          symbol: 'SPY',
          valueInBaseCurrency: 7000
        },
        BND: {
          allocationInPercentage: 0.3,
          dataSource: DataSource.YAHOO,
          symbol: 'BND',
          valueInBaseCurrency: 3000
        }
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    const generateTextSpy = jest
      .spyOn(subject, 'generateText')
      .mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Am I on track for early retirement?',
      sessionId: 'session-fire-routing',
      userCurrency: 'USD',
      userId: 'user-fire-routing'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'fire_analysis' })
      ])
    );
    expect(result.toolCalls).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ tool: 'portfolio_analysis' }),
        expect.objectContaining({ tool: 'get_portfolio_summary' }),
        expect.objectContaining({ tool: 'risk_assessment' }),
        expect.objectContaining({ tool: 'stress_test' }),
        expect.objectContaining({ tool: 'market_data_lookup' })
      ])
    );
    expect(generateTextSpy).not.toHaveBeenCalled();
    expect(result.answer).toContain('FIRE quick check (rule-of-thumb):');
    expect(result.answer).toContain(
      'Portfolio value: 10000.00 USD across 2 holdings.'
    );
    expect(result.answer).toContain('4% withdrawal estimate: 400.00 USD/year');
    expect(result.answer).toContain(
      'Diversification: top holding SPY at 70.00%'
    );
  });

  it('routes "top 5 stocks now" to current holdings tool instead of clarify refusal', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.4,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 4000
        },
        MSFT: {
          allocationInPercentage: 0.35,
          dataSource: DataSource.YAHOO,
          symbol: 'MSFT',
          valueInBaseCurrency: 3500
        },
        NVDA: {
          allocationInPercentage: 0.25,
          dataSource: DataSource.YAHOO,
          symbol: 'NVDA',
          valueInBaseCurrency: 2500
        }
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'top 5 stocks now?',
      sessionId: 'session-top-five-stocks',
      userCurrency: 'USD',
      userId: 'user-top-five-stocks'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'success',
          tool: 'get_current_holdings'
        })
      ])
    );
    expect(result.answer).not.toContain(
      'Insufficient confidence to provide a reliable answer from this query alone.'
    );
    expect(result.answer).not.toContain(
      'Insufficient confidence to answer safely with the current evidence.'
    );
  });

  it('reuses one quote lookup for combined market and live quote tools', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {}
    });
    dataProviderService.getQuotes.mockResolvedValue({
      NVDA: {
        currency: 'USD',
        marketPrice: 950.5,
        marketState: 'REGULAR'
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    const result = await subject.chat({
      languageCode: 'en',
      query: 'Show the latest live quote for NVDA',
      sessionId: 'session-live-quote-cache',
      userCurrency: 'USD',
      userId: 'user-live-quote-cache'
    });

    expect(result.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'get_live_quote' })
      ])
    );
    expect(dataProviderService.getQuotes).toHaveBeenCalledTimes(1);
  });

  it('includes portfolio state version in response cache key for portfolio-sensitive tool routes', async () => {
    let holdingsState = {
      AAPL: {
        allocationInPercentage: 0.6,
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL',
        valueInBaseCurrency: 6000
      },
      MSFT: {
        allocationInPercentage: 0.4,
        dataSource: DataSource.YAHOO,
        symbol: 'MSFT',
        valueInBaseCurrency: 4000
      }
    };

    portfolioService.getDetails.mockImplementation(async () => {
      return {
        holdings: holdingsState
      };
    });
    redisCacheService.get.mockResolvedValue(undefined);
    jest.spyOn(subject, 'generateText').mockRejectedValue(new Error('offline'));

    await subject.chat({
      languageCode: 'en',
      query: 'Analyze my portfolio concentration risk',
      sessionId: 'session-cache-version-1',
      userCurrency: 'USD',
      userId: 'user-cache-version'
    });

    holdingsState = {
      AAPL: {
        allocationInPercentage: 0.3,
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL',
        valueInBaseCurrency: 3000
      },
      MSFT: {
        allocationInPercentage: 0.7,
        dataSource: DataSource.YAHOO,
        symbol: 'MSFT',
        valueInBaseCurrency: 7000
      }
    };

    await subject.chat({
      languageCode: 'en',
      query: 'Analyze my portfolio concentration risk',
      sessionId: 'session-cache-version-2',
      userCurrency: 'USD',
      userId: 'user-cache-version'
    });

    const responseCacheKeys = redisCacheService.get.mock.calls
      .map(([key]) => key as string)
      .filter((key) => key.startsWith('ai:response:user-cache-version:'));

    expect(responseCacheKeys).toHaveLength(2);
    expect(responseCacheKeys[0]).not.toEqual(responseCacheKeys[1]);
    expect(responseCacheKeys[0]).toMatch(
      /^ai:response:user-cache-version:[^:]+:[^:]+:[^:]+$/
    );
    expect(responseCacheKeys[1]).toMatch(
      /^ai:response:user-cache-version:[^:]+:[^:]+:[^:]+$/
    );
  });

  it('injects next response preference into tool-to-LLM prompt', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {
        AAPL: {
          allocationInPercentage: 0.6,
          dataSource: DataSource.YAHOO,
          symbol: 'AAPL',
          valueInBaseCurrency: 6000
        }
      }
    });
    dataProviderService.getQuotes.mockResolvedValue({
      AAPL: {
        currency: 'USD',
        marketPrice: 210.12,
        marketState: 'REGULAR'
      }
    });
    redisCacheService.get.mockResolvedValue(undefined);

    const generateTextSpy = jest
      .spyOn(subject, 'generateText')
      .mockResolvedValue({
        text: 'Preference applied response.'
      } as never);

    await subject.chat({
      languageCode: 'en',
      nextResponsePreference: 'Keep the response to 3 bullets.',
      query: 'Analyze my portfolio risk',
      sessionId: 'session-pref-prompt',
      userCurrency: 'USD',
      userId: 'user-pref-prompt'
    });

    expect(generateTextSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'User preference for this response: Keep the response to 3 bullets.'
        )
      })
    );
  });

  it('uses z.ai glm provider when z_ai_glm_api_key is available', async () => {
    process.env.z_ai_glm_api_key = 'zai-key';
    process.env.z_ai_glm_model = 'glm-5';

    const fetchMock = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'zai-response' } }]
      }),
      ok: true
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await subject.generateText({
      prompt: 'hello'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.z.ai/api/paas/v4/chat/completions',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(result).toEqual({
      text: 'zai-response'
    });
    expect(aiObservabilityService.recordLlmInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'glm-5',
        provider: 'z_ai_glm',
        responseText: 'zai-response'
      })
    );
    expect(propertyService.getByKey).not.toHaveBeenCalled();
  });

  it('uses minimax when ChatGPT is not configured in auto mode', async () => {
    process.env.z_ai_glm_api_key = 'zai-key';
    process.env.minimax_api_key = 'minimax-key';
    process.env.minimax_model = 'MiniMax-M2.5';

    const fetchMock = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'minimax-response' } }]
      }),
      ok: true
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await subject.generateText({
      prompt: 'fallback test'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.minimax.io/v1/chat/completions',
      expect.any(Object)
    );
    expect(result).toEqual({
      text: 'minimax-response'
    });
    expect(aiObservabilityService.recordLlmInvocation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: 'MiniMax-M2.5',
        provider: 'minimax',
        responseText: 'minimax-response'
      })
    );
  });

  it('tries chatgpt first in auto mode', async () => {
    process.env.z_ai_glm_api_key = 'zai-key';
    process.env.minimax_api_key = 'minimax-key';
    process.env.minimax_model = 'MiniMax-M2.5';
    process.env.openai_api_key = 'openai-key';
    process.env.openai_model = 'gpt-4o-mini';

    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'openai-response' } }]
      })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await subject.generateText({
      prompt: 'openai fallback test'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.openai.com/v1/chat/completions',
      expect.any(Object)
    );
    expect(result).toEqual({
      text: 'openai-response'
    });
    expect(aiObservabilityService.recordLlmInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        provider: 'openai',
        responseText: 'openai-response'
      })
    );
  });

  it('uses chatgpt alias as openai', async () => {
    process.env.openai_api_key = 'openai-key';
    process.env.openai_model = 'gpt-4o-mini';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'chatgpt-alias-response' } }]
      })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await subject.generateText({
      model: 'chatgpt',
      prompt: 'chatgpt alias test'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.any(Object)
    );
    expect(result).toEqual({
      text: 'chatgpt-alias-response'
    });
  });

  it('uses openai provider when explicitly requested', async () => {
    process.env.openai_api_key = 'openai-key';
    process.env.openai_model = 'gpt-4o-mini';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'explicit-openai-response' } }]
      })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await subject.generateText({
      model: 'openai',
      prompt: 'explicit model test'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.any(Object)
    );
    expect(result).toEqual({
      text: 'explicit-openai-response'
    });
  });

  it('falls back to openrouter when minimax provider fails', async () => {
    process.env.minimax_api_key = 'minimax-key';
    process.env.minimax_model = 'MiniMax-M2.5';
    propertyService.getByKey
      .mockResolvedValueOnce('openrouter-key')
      .mockResolvedValueOnce('gpt-4o-mini');

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: 'chatcmpl-1',
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'openrouter-response'
                },
                finish_reason: 'stop'
              }
            ]
          })
        ),
        headers: {
          forEach: jest.fn()
        },
        json: jest.fn().mockResolvedValue({
          id: 'chatcmpl-1',
          model: 'gpt-4o-mini',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'openrouter-response'
              },
              finish_reason: 'stop'
            }
          ]
        })
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await subject.generateText({
      model: 'minimax',
      prompt: 'fallback to openrouter'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.minimax.io/v1/chat/completions',
      expect.any(Object)
    );
    expect(result).toEqual({
      text: 'openrouter-response'
    });
    expect(aiObservabilityService.recordLlmInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'minimax'
      })
    );
    expect(aiObservabilityService.recordLlmInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openrouter',
        responseText: 'openrouter-response'
      })
    );
  });

  it('does not chain providers in auto mode when fallback is disabled', async () => {
    process.env.minimax_api_key = 'minimax-key';
    process.env.minimax_model = 'MiniMax-M2.5';
    delete process.env.AI_AGENT_LLM_ALLOW_FALLBACKS;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      subject.generateText({
        prompt: 'single-pass auto mode test'
      })
    ).rejects.toThrow('provider request failed with status 500');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.minimax.io/v1/chat/completions',
      expect.any(Object)
    );
    expect(propertyService.getByKey).not.toHaveBeenCalled();
  });

  it('captures observability failure events when chat throws', async () => {
    portfolioService.getDetails.mockResolvedValue({
      holdings: {}
    });
    redisCacheService.get.mockResolvedValue(undefined);
    redisCacheService.set.mockRejectedValue(new Error('redis write failed'));
    jest.spyOn(subject, 'generateText').mockResolvedValue({
      text: 'Fallback response'
    } as never);

    await expect(
      subject.chat({
        languageCode: 'en',
        query: 'Show my portfolio allocation',
        sessionId: 'session-observability-failure',
        userCurrency: 'USD',
        userId: 'user-observability-failure'
      })
    ).rejects.toThrow('redis write failed');

    expect(aiObservabilityService.captureChatFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Show my portfolio allocation',
        sessionId: 'session-observability-failure',
        userId: 'user-observability-failure'
      })
    );
  });
});
