import {
  applyToolExecutionPolicy,
  createPolicyRouteResponse
} from './ai-agent.policy.utils';
import {
  calculateConfidence,
  determineToolPlan,
  evaluateAnswerQuality,
  extractSymbolsFromQuery,
  isGeneratedAnswerReliable,
  normalizeIntentQuery
} from './ai-agent.utils';

describe('AiAgentUtils', () => {
  it('extracts and deduplicates symbols from query', () => {
    expect(extractSymbolsFromQuery('Check AAPL and TSLA then AAPL')).toEqual([
      'AAPL',
      'TSLA'
    ]);
  });

  it('ignores common uppercase stop words while keeping ticker symbols', () => {
    expect(
      extractSymbolsFromQuery('WHAT IS THE PRICE OF NVDA AND TSLA')
    ).toEqual(['NVDA', 'TSLA']);
  });

  it('supports dollar-prefixed lowercase or mixed-case symbol input', () => {
    expect(extractSymbolsFromQuery('Check $nvda and $TsLa')).toEqual([
      'NVDA',
      'TSLA'
    ]);
  });

  it('extracts ticker symbol from natural-language company name aliases', () => {
    expect(extractSymbolsFromQuery('fundamentals on tesla stock?')).toEqual([
      'TSLA'
    ]);
  });

  it('extracts ticker symbol from freshness-style company updates', () => {
    expect(extractSymbolsFromQuery('whats new for tesla')).toEqual(['TSLA']);
  });

  it('does not map common words to symbols without finance context', () => {
    expect(
      extractSymbolsFromQuery('I bought an apple and read a blocked app note.')
    ).toEqual([]);
  });

  it('extracts symbols from expanded popular company-name aliases', () => {
    const symbols = extractSymbolsFromQuery(
      'fundamentals on jpmorgan, eli lilly, and procter and gamble'
    );

    expect(symbols).toEqual(expect.arrayContaining(['JPM', 'LLY', 'PG']));
  });

  it('extracts symbols from lowercase popular ETF aliases', () => {
    const symbols = extractSymbolsFromQuery('compare spy qqq and schd');

    expect(symbols).toEqual(expect.arrayContaining(['SPY', 'QQQ', 'SCHD']));
  });

  it('selects portfolio and risk tools for risk query', () => {
    expect(
      determineToolPlan({
        query: 'Analyze portfolio concentration risk'
      })
    ).toEqual(['portfolio_analysis', 'risk_assessment']);
  });

  it('selects market tool for quote query', () => {
    expect(
      determineToolPlan({
        query: 'What is the price for NVDA?',
        symbols: ['NVDA']
      })
    ).toEqual(['market_data_lookup']);
  });

  it('routes simple symbol allocation lookup to portfolio analysis only', () => {
    expect(
      determineToolPlan({
        query: 'msft allocation?'
      })
    ).toEqual(['portfolio_analysis']);
  });

  it('selects current holdings tool for top stocks prompt phrasing', () => {
    expect(
      determineToolPlan({
        query: 'top 5 stocks now?'
      })
    ).toEqual(['get_current_holdings']);
  });

  it('selects portfolio analysis for portfolio value query wording', () => {
    expect(
      determineToolPlan({
        query: 'how much money i have?'
      })
    ).toEqual(['portfolio_analysis']);
  });

  it('selects portfolio analysis for typo and punctuation in value query wording', () => {
    expect(
      determineToolPlan({
        query: 'how much.i ahve money?'
      })
    ).toEqual(['portfolio_analysis']);
  });

  it('returns no tools when no clear tool keyword exists', () => {
    expect(
      determineToolPlan({
        query: 'Help me with my account'
      })
    ).toEqual([]);
  });

  it('does not route standalone FIRE text to FIRE tools', () => {
    expect(
      determineToolPlan({
        query: 'This is totally unrelated to fire.'
      })
    ).toEqual([]);
  });

  it('returns no tools for self-identity queries', () => {
    expect(
      determineToolPlan({
        query: 'who am i'
      })
    ).toEqual([]);
  });

  it('routes greetings to direct no-tool policy', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['portfolio_analysis'],
      query: 'Hi'
    });

    expect(decision.route).toBe('direct');
    expect(decision.toolsToExecute).toEqual([]);
    expect(decision.blockedByPolicy).toBe(true);
    expect(decision.blockReason).toBe('no_tool_query');
    expect(decision.forcedDirect).toBe(true);
  });

  it('routes assistant capability prompts to direct no-tool policy', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'Who are you?'
    });

    expect(decision.route).toBe('direct');
    expect(decision.toolsToExecute).toEqual([]);
    expect(decision.blockReason).toBe('no_tool_query');
    expect(
      createPolicyRouteResponse({
        policyDecision: decision,
        query: 'Who are you?'
      })
    ).toContain('Ghostfolio AI');
  });

  it('returns deterministic arithmetic result for direct no-tool arithmetic query', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: '2+2'
    });

    expect(decision.route).toBe('direct');
    expect(decision.toolsToExecute).toEqual([]);
    expect(
      createPolicyRouteResponse({ policyDecision: decision, query: '2+2' })
    ).toBe('2+2 = 4');
  });

  it('routes finance-intent prompts to tools via fallback scorer', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'What can you do about my portfolio risk?'
    });

    expect(decision.route).toBe('tools');
    expect(['portfolio_analysis', 'risk_assessment']).toContain(
      decision.toolsToExecute[0]
    );
    expect(decision.blockedByPolicy).toBe(false);
  });

  it('routes finance-style query to tools when planner provides no tools', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'Portfolio please'
    });

    expect(decision.route).toBe('tools');
    expect(decision.toolsToExecute).toEqual(['portfolio_analysis']);
    expect(decision.blockedByPolicy).toBe(false);
  });

  it('blocks rebalance tool without explicit action intent while keeping read tools', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['portfolio_analysis', 'risk_assessment', 'rebalance_plan'],
      query: 'Review portfolio concentration risk'
    });

    expect(decision.route).toBe('tools');
    expect(decision.toolsToExecute).toEqual([
      'portfolio_analysis',
      'risk_assessment'
    ]);
    expect(decision.blockedByPolicy).toBe(true);
    expect(decision.blockReason).toBe('needs_confirmation');
  });

  it('selects risk reasoning for investment intent queries', () => {
    expect(
      determineToolPlan({
        query: 'Where should I invest next?'
      })
    ).toEqual(['portfolio_analysis', 'risk_assessment', 'rebalance_plan']);
  });

  it('selects market research stack for ticker-specific investment decisions', () => {
    expect(
      determineToolPlan({
        query: 'Should I invest in NVIDIA right now?'
      })
    ).toEqual([
      'get_asset_fundamentals',
      'get_financial_news',
      'price_history'
    ]);
  });

  it('combines portfolio and market tools when ticker decision includes portfolio context', () => {
    expect(
      determineToolPlan({
        query: 'Should I invest in NVDA for my portfolio?'
      })
    ).toEqual([
      'portfolio_analysis',
      'risk_assessment',
      'rebalance_plan',
      'get_asset_fundamentals',
      'get_financial_news',
      'price_history'
    ]);
  });

  it('selects historical-price tools for ticker performance queries', () => {
    expect(
      determineToolPlan({
        query: 'How has NVIDIA performed over time?'
      })
    ).toEqual(['price_history']);
  });

  it('selects FIRE analysis tool for retirement-path queries', () => {
    expect(
      determineToolPlan({
        query: 'Am I on track for early retirement?'
      })
    ).toEqual(['fire_analysis']);
  });

  it('routes age-related FIRE prompts to retirement analysis', () => {
    expect(
      determineToolPlan({
        query: "I'm getting old, am I close to retirement age?"
      })
    ).toEqual(['fire_analysis']);
  });

  it('selects recommendation tools for ambiguous action phrasing', () => {
    expect(
      determineToolPlan({
        query: 'What can I do?'
      })
    ).toEqual(['portfolio_analysis', 'risk_assessment', 'rebalance_plan']);
  });

  it('selects rebalance tool for rebalance-focused prompts', () => {
    expect(
      determineToolPlan({
        query: 'How should I rebalance overweight positions?'
      })
    ).toEqual(['portfolio_analysis', 'risk_assessment', 'rebalance_plan']);
  });

  it('selects stress test tool for crash scenario prompts', () => {
    expect(
      determineToolPlan({
        query: 'Run a drawdown stress test on my portfolio'
      })
    ).toEqual(['portfolio_analysis', 'risk_assessment', 'stress_test']);
  });

  it('selects stress test tool for common misspelling of stress', () => {
    expect(
      determineToolPlan({
        query: 'Run a strestt test on my portfolio'
      })
    ).toEqual(['portfolio_analysis', 'risk_assessment', 'stress_test']);
  });

  it('selects recent transactions tool for transaction-history prompts', () => {
    expect(
      determineToolPlan({
        query: 'Show my recent transactions'
      })
    ).toEqual(['get_recent_transactions']);
  });

  it('selects recent transactions tool for command-style query naming', () => {
    expect(
      determineToolPlan({
        query: 'get_recent_transactions'
      })
    ).toEqual(['get_recent_transactions']);
  });

  it('selects fundamentals tool for fundamentals prompts', () => {
    expect(
      determineToolPlan({
        query: 'Get fundamentals for AAPL'
      })
    ).toEqual(['get_asset_fundamentals']);
  });

  it('selects fundamentals tools for natural-language company fundamentals prompts', () => {
    expect(
      determineToolPlan({
        query: 'fundamentals on tesla stock?'
      })
    ).toEqual(['get_asset_fundamentals']);
  });

  it('selects fundamentals tools for typo-prefixed fundamentals prompts', () => {
    expect(
      determineToolPlan({
        query: 'wfundamentals on tesla stock?'
      })
    ).toEqual(['get_asset_fundamentals']);
  });

  it('selects fundamentals tools for natural-language bank stock prompts', () => {
    expect(
      determineToolPlan({
        query: 'fundamentals on jpmorgan stock'
      })
    ).toEqual(['get_asset_fundamentals']);
  });

  it('selects financial news tool for headline prompts', () => {
    expect(
      determineToolPlan({
        query: 'Show financial news for TSLA'
      })
    ).toEqual(['get_financial_news']);
  });

  it('selects financial news tool for direct symbol news requests', () => {
    expect(
      determineToolPlan({
        query: 'apple news this year?'
      })
    ).toEqual(['get_financial_news']);
  });

  it('selects financial news tool for freshness-style company prompts', () => {
    expect(
      determineToolPlan({
        query: 'whats new for tesla'
      })
    ).toEqual(['get_financial_news']);
  });

  it('selects financial news tool for update phrasing with symbol', () => {
    expect(
      determineToolPlan({
        query: 'update me on nvda'
      })
    ).toEqual(['get_financial_news']);
  });

  it('selects transaction categorization tool for transaction pattern prompts', () => {
    expect(
      determineToolPlan({
        query: 'Categorize my recent transactions by type and pattern'
      })
    ).toEqual(['get_recent_transactions', 'transaction_categorize']);
  });

  it('selects tax estimate tool for tax liability prompts', () => {
    expect(
      determineToolPlan({
        query:
          'Estimate my tax liability for income 120000 and deductions 20000'
      })
    ).toEqual(['tax_estimate']);
  });

  it('selects tax estimate tool for broad tax planning prompts', () => {
    expect(
      determineToolPlan({
        query: 'what do i need to know this year about taxes'
      })
    ).toEqual(['tax_estimate']);
  });

  it.each([
    ['show my taxs', ['tax_estimate']],
    ['show my taxis', ['tax_estimate']],
    ['check complience', ['get_recent_transactions', 'compliance_check']],
    ['get newz for nvda', ['get_financial_news']],
    ['show fundamntals for nvda', ['get_asset_fundamentals']],
    ['what is the quot for nvda', ['market_data_lookup']],
    ['exchage usd to eur', ['exchange_rate']],
    ['sybol lookup for apple', ['symbol_lookup']],
    ['show benhmark indices', ['market_benchmarks']],
    ['show my porfolio allocation', ['portfolio_analysis']]
  ] as [string, string[]][])(
    'recovers typo query "%s" to expected tool plan',
    (query, expectedTools) => {
      expect(
        determineToolPlan({
          query
        })
      ).toEqual(expectedTools);
    }
  );

  it('normalizes allowlisted cross-tool typo tokens', () => {
    expect(
      normalizeIntentQuery(
        'show my porfolio and newz, check complience, exchage usd to eur'
      )
    ).toBe(
      'show my portfolio and news check compliance exchange usd to eur'
    );
  });

  it('selects compliance check tool for compliance review prompts', () => {
    expect(
      determineToolPlan({
        query: 'Run compliance check on my recent transactions'
      })
    ).toEqual(['get_recent_transactions', 'compliance_check']);
  });

  it('selects account overview tool for account summary prompts', () => {
    expect(
      determineToolPlan({
        query: 'Show account overview and balances'
      })
    ).toEqual(['account_overview']);
  });

  it('selects exchange rate tool for currency conversion prompts', () => {
    expect(
      determineToolPlan({
        query: 'Convert usd to eur exchange rate'
      })
    ).toEqual(['exchange_rate']);
  });

  it('selects price history tool for historical trend prompts', () => {
    expect(
      determineToolPlan({
        query: 'Show price history for NVDA'
      })
    ).toEqual(['price_history']);
  });

  it('selects symbol lookup tool for ticker lookup prompts', () => {
    expect(
      determineToolPlan({
        query: 'What is the ticker for Apple?'
      })
    ).toEqual(['symbol_lookup']);
  });

  it('selects market benchmarks tool for benchmark prompts', () => {
    expect(
      determineToolPlan({
        query: 'Show benchmark indices'
      })
    ).toEqual(['market_benchmarks']);
  });

  it('selects activity history tool for activity-history prompts', () => {
    expect(
      determineToolPlan({
        query: 'Give me activity history for my account'
      })
    ).toEqual(['activity_history']);
  });

  it('selects demo data tool for demo-data prompts', () => {
    expect(
      determineToolPlan({
        query: 'Load demo data'
      })
    ).toEqual(['demo_data']);
  });

  it('selects demo data tool for test-data quick-check prompts', () => {
    expect(
      determineToolPlan({
        query: 'Add test data for a quick check'
      })
    ).toEqual(['seed_funds']);
  });

  it('selects seed funds tool for adding seed money', () => {
    expect(
      determineToolPlan({
        query: 'Add seed money 2500 for testing'
      })
    ).toEqual(['seed_funds']);
  });

  it('selects seed funds tool for "seed my account" phrasing with split amounts', () => {
    expect(
      determineToolPlan({
        query:
          'seed my account with stocks of apple tesla and goodle split 10000 30% 20% and 50%'
      })
    ).toEqual(['seed_funds']);
  });

  it('keeps both seed funds and account overview tool when requested together', () => {
    expect(
      determineToolPlan({
        query: 'Add seed funds and show my account balance'
      })
    ).toEqual(
      expect.arrayContaining(['seed_funds', 'account_overview'])
    );
  });

  it.each([
    'top up my account with 2000',
    'add more money to my account',
    'put more money in my account',
    'inject more money into my account',
    'fund my account with 1500 usd',
    'add cash into my account for testing'
  ])('selects seed funds tool for funding variant "%s"', (query) => {
    expect(
      determineToolPlan({
        query
      })
    ).toContain('seed_funds');
  });

  it('selects create account tool for account creation prompts', () => {
    expect(
      determineToolPlan({
        query: 'Create account named Trading'
      })
    ).toEqual(['create_account']);
  });

  it('selects create order tool for order creation prompts', () => {
    const plan = determineToolPlan({
      query: 'Place order for 2 shares of AAPL at 100'
    });

    expect(plan).toEqual(expect.arrayContaining(['create_order']));
  });

  it('selects create order tool for natural order phrasing', () => {
    const plan = determineToolPlan({
      query: 'make an order for tesla'
    });

    expect(plan).toEqual(expect.arrayContaining(['create_order']));
  });

  it('keeps explicit notional order prompts focused on create_order', () => {
    const plan = determineToolPlan({
      query: 'Buy 1000 USD of TSLA'
    });

    expect(plan).toContain('create_order');
    expect(plan).not.toEqual(
      expect.arrayContaining([
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan',
        'market_data_lookup'
      ])
    );
  });

  it('routes quantity-plus-stock wording to create_order without risk bundle', () => {
    const plan = determineToolPlan({
      query: 'buy 10 tesla stocks'
    });

    expect(plan).toContain('create_order');
    expect(plan).not.toEqual(
      expect.arrayContaining([
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan',
        'market_data_lookup'
      ])
    );
  });

  it('fast-paths simple "buy [symbol]" to create_order only', () => {
    const plan = determineToolPlan({
      query: 'buy nvidia'
    });

    expect(plan).toEqual(['create_order']);
  });

  it('fast-paths simple "sell [symbol]" to create_order only', () => {
    const plan = determineToolPlan({
      query: 'sell AAPL'
    });

    expect(plan).toEqual(['create_order']);
  });

  it('fast-paths demo data request to demo_data tool only', () => {
    const plan = determineToolPlan({
      query: 'demo data'
    });

    expect(plan).toEqual(['demo_data']);
  });

  it('fast-paths seed funds request to seed_funds tool only', () => {
    const plan = determineToolPlan({
      query: 'seed my account'
    });

    expect(plan).toEqual(['seed_funds']);
  });

  it('routes "how many <symbol> stocks i have" to current holdings', () => {
    const plan = determineToolPlan({
      query: 'how many tesla stocks i have'
    });

    expect(plan).toContain('get_current_holdings');
  });

  it('routes multiline holdings follow-up phrasing to current holdings', () => {
    const plan = determineToolPlan({
      query: 'how many tesla stocks i\n        have'
    });

    expect(plan).toContain('get_current_holdings');
  });

  it('selects trade impact simulation for explicit what-if trade prompts', () => {
    expect(
      determineToolPlan({
        query: 'Simulate trade impact if I buy 1000 AAPL'
      })
    ).toEqual(
      expect.arrayContaining([
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan',
        'market_data_lookup',
        'simulate_trade_impact'
      ])
    );
  });

  it('calculates bounded confidence score and band', () => {
    const confidence = calculateConfidence({
      toolCalls: [
        {
          input: {},
          outputSummary: 'ok',
          status: 'success',
          tool: 'portfolio_analysis'
        },
        {
          input: {},
          outputSummary: 'ok',
          status: 'success',
          tool: 'risk_assessment'
        },
        {
          input: {},
          outputSummary: 'failed',
          status: 'failed',
          tool: 'market_data_lookup'
        }
      ],
      verification: [
        {
          check: 'numerical_consistency',
          details: 'ok',
          status: 'passed'
        },
        {
          check: 'tool_execution',
          details: 'partial',
          status: 'warning'
        },
        {
          check: 'market_data_coverage',
          details: 'missing',
          status: 'failed'
        }
      ]
    });

    expect(confidence.score).toBeGreaterThanOrEqual(0);
    expect(confidence.score).toBeLessThanOrEqual(1);
    expect(['high', 'medium', 'low']).toContain(confidence.band);
  });

  it('keeps no-tool responses in low confidence band', () => {
    const confidence = calculateConfidence({
      toolCalls: [],
      verification: [
        {
          check: 'v1',
          details: 'ok',
          status: 'passed'
        },
        {
          check: 'v2',
          details: 'ok',
          status: 'passed'
        },
        {
          check: 'v3',
          details: 'ok',
          status: 'passed'
        },
        {
          check: 'v4',
          details: 'ok',
          status: 'passed'
        },
        {
          check: 'v5',
          details: 'warn',
          status: 'warning'
        }
      ]
    });

    expect(confidence.score).toBe(0.44);
    expect(confidence.band).toBe('low');
  });

  it('uses high band at the 0.8 confidence threshold', () => {
    const confidence = calculateConfidence({
      toolCalls: [
        {
          input: {},
          outputSummary: 'ok',
          status: 'success',
          tool: 'portfolio_analysis'
        }
      ],
      verification: [
        {
          check: 'v1',
          details: 'ok',
          status: 'passed'
        },
        {
          check: 'v2',
          details: 'warn',
          status: 'warning'
        },
        {
          check: 'v3',
          details: 'warn',
          status: 'warning'
        },
        {
          check: 'v4',
          details: 'warn',
          status: 'warning'
        },
        {
          check: 'v5',
          details: 'warn',
          status: 'warning'
        }
      ]
    });

    expect(confidence.score).toBe(0.8);
    expect(confidence.band).toBe('high');
  });

  it('accepts generated answer with actionable and numeric support', () => {
    expect(
      isGeneratedAnswerReliable({
        answer:
          'Trim AAPL by 5% and allocate the next 1000 USD into MSFT and BND to reduce concentration risk.',
        query: 'Where should I invest next to rebalance my portfolio?'
      })
    ).toBe(true);
  });

  it('rejects generated answer with disclaimer language', () => {
    expect(
      isGeneratedAnswerReliable({
        answer:
          'As an AI, I cannot provide financial advice. Please consult a financial advisor.',
        query: 'How should I rebalance my portfolio?'
      })
    ).toBe(false);
  });

  it('marks response quality as warning when quantitative support is missing', () => {
    const qualityCheck = evaluateAnswerQuality({
      answer:
        'Your allocation profile is concentrated in one name and needs balancing across other holdings.',
      query: 'Show risk concentration and latest price trend for AAPL'
    });

    expect(qualityCheck.check).toBe('response_quality');
    expect(qualityCheck.status).toBe('warning');
    expect(qualityCheck.details).toContain(
      'Quantitative query response lacks numeric support'
    );
  });

  it('marks response quality as failed for generic AI disclaimers', () => {
    const qualityCheck = evaluateAnswerQuality({
      answer:
        'As an AI, I am not your financial advisor so I cannot provide financial advice.',
      query: 'Should I buy more MSFT?'
    });

    expect(qualityCheck.check).toBe('response_quality');
    expect(qualityCheck.status).toBe('failed');
  });

  it.each([
    {
      expected: ['AAPL', 'MSFT'],
      query: 'Need AAPL plus MSFT update'
    },
    {
      expected: ['BRK.B', 'VTI'],
      query: 'Quote BRK.B and VTI'
    },
    {
      expected: ['QQQ', 'SPY'],
      query: 'Check $qqq against $spy'
    },
    {
      expected: ['AAPL'],
      query: 'Price for AAPL and THE and WHAT'
    },
    {
      expected: [],
      query: 'price for appl and tsla in lowercase without prefixes'
    },
    {
      expected: ['AMD', 'NVDA'],
      query: 'Show AMD then $nvda'
    },
    {
      expected: ['NVDA'],
      query: 'tell me about nvidia'
    },
    {
      expected: ['BTCUSD'],
      query: 'ticker BTCUSD now'
    },
    {
      expected: ['MSFT'],
      query: 'Quote MSFT, msft, and $msft'
    },
    {
      expected: ['SHOP.TO'],
      query: 'market for SHOP.TO'
    },
    {
      expected: [],
      query: 'what can you do'
    }
  ])(
    'extractSymbolsFromQuery handles edge case: $query',
    ({ expected, query }) => {
      expect(extractSymbolsFromQuery(query)).toEqual(expected);
    }
  );

  it.each([
    {
      expectedTools: ['portfolio_analysis'],
      query: 'portfolio overview'
    },
    {
      expectedTools: ['portfolio_analysis'],
      query: 'holdings summary'
    },
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan'
      ],
      query: 'allocation snapshot'
    },
    {
      expectedTools: ['portfolio_analysis'],
      query: 'performance review'
    },
    {
      expectedTools: ['portfolio_analysis', 'risk_assessment'],
      query: 'risk concentration report'
    },
    {
      expectedTools: ['portfolio_analysis', 'risk_assessment'],
      query: 'diversification check'
    },
    {
      expectedTools: ['market_data_lookup'],
      query: 'price for NVDA'
    },
    {
      expectedTools: ['market_data_lookup'],
      query: 'ticker quote for AAPL'
    },
    {
      expectedTools: [],
      query: 'market context'
    },
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan'
      ],
      query: 'where should I invest next'
    },
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan'
      ],
      query: 'trim overweight positions'
    },
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan'
      ],
      query: 'sell and rebalance'
    },
    {
      expectedTools: ['portfolio_analysis', 'risk_assessment', 'stress_test'],
      query: 'run a crash stress test'
    },
    {
      expectedTools: ['portfolio_analysis', 'risk_assessment', 'stress_test'],
      query: 'drawdown shock analysis'
    },
    {
      expectedTools: ['portfolio_analysis', 'risk_assessment', 'stress_test'],
      query: 'stress scenario'
    },
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan',
        'market_data_lookup'
      ],
      query: 'rebalance portfolio and quote NVDA'
    },
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'market_data_lookup'
      ],
      query: 'analyze risk and market price'
    },
    {
      expectedTools: [],
      query: 'who are you'
    },
    {
      expectedTools: [],
      query: 'hello there'
    },
    {
      expectedTools: [],
      query: 'help me with account settings'
    }
  ])(
    'determineToolPlan returns expected tools for "$query"',
    ({ expectedTools, query }) => {
      expect(determineToolPlan({ query })).toEqual(expectedTools);
    }
  );

  it.each([
    {
      expected: true,
      query: 'How should I rebalance and reduce concentration risk?',
      text: 'Trim your top position by 4% and direct the next 1500 USD to two smaller holdings. Recheck concentration after each contribution.'
    },
    {
      expected: true,
      query: 'What is my market price exposure?',
      text: 'AAPL is 210.12 USD and MSFT is 455.90 USD. Market exposure remains concentrated in your top position.'
    },
    {
      expected: false,
      query: 'Should I buy more MSFT?',
      text: 'As an AI, I cannot provide financial advice and you should consult a financial advisor.'
    },
    {
      expected: false,
      query: 'What are my risk metrics right now?',
      text: 'Risk seems elevated overall with concentration concerns but no specific values are available.'
    },
    {
      expected: false,
      query: 'Where should I invest next?',
      text: 'Consider your long-term goals.'
    },
    {
      expected: true,
      query: 'Where should I invest next?',
      text: 'Allocate 70% of new money to positions outside your top holding and 30% to broad-market exposure. This lowers concentration without forced selling.'
    },
    {
      expected: true,
      query: 'Run stress drawdown estimate',
      text: 'Under a 20% shock, estimated drawdown is 3200 USD and projected value is 12800 USD. Reduce single-name concentration to improve downside stability.'
    },
    {
      expected: false,
      query: 'Run stress drawdown estimate',
      text: 'Stress impact could be meaningful and diversification may help over time.'
    },
    {
      expected: false,
      query: 'What is concentration risk now?',
      text: 'Risk is high.'
    },
    {
      expected: true,
      query: 'What is concentration risk now?',
      text: 'Top holding is 52.4% with HHI 0.331. Trim 2-4 percentage points from the top position or add to underweight holdings.'
    }
  ])(
    'isGeneratedAnswerReliable=$expected for quality gate case',
    ({ expected, query, text }) => {
      expect(
        isGeneratedAnswerReliable({
          answer: text,
          query
        })
      ).toBe(expected);
    }
  );

  it.each([
    {
      expectedStatus: 'passed',
      query: 'How should I rebalance risk?',
      text: 'Top holding is 48%. Trim 3% from the largest position and add to two underweight holdings. Re-evaluate concentration in one week.'
    },
    {
      expectedStatus: 'warning',
      query: 'Show concentration and market price risk',
      text: 'Concentration is elevated and diversification would improve resilience over time.'
    },
    {
      expectedStatus: 'warning',
      query: 'Where should I invest next?',
      text: 'You can diversify over time by considering additional positions that fit your risk profile and timeline.'
    },
    {
      expectedStatus: 'failed',
      query: 'Where should I invest next?',
      text: 'As an AI, I cannot provide financial advice and you should consult a financial advisor.'
    },
    {
      expectedStatus: 'warning',
      query: 'What is my drawdown risk right now?',
      text: 'Drawdown risk exists and depends on current concentration and market volatility.'
    },
    {
      expectedStatus: 'passed',
      query: 'What is my drawdown risk right now?',
      text: 'At a 20% shock, projected drawdown is 2600 USD. Reduce your top position by 2-3 points to lower downside risk concentration.'
    },
    {
      expectedStatus: 'warning',
      query: 'Show my market quote and risk',
      text: 'AAPL is high and risk is elevated.'
    },
    {
      expectedStatus: 'passed',
      query: 'Show my market quote and risk',
      text: 'AAPL is 212.40 USD and top holding concentration is 46.2%. Rebalance by directing new cash into lower-weight holdings.'
    },
    {
      expectedStatus: 'warning',
      query: 'Analyze performance and allocation',
      text: 'Performance and allocation are stable.'
    },
    {
      expectedStatus: 'passed',
      query: 'Analyze performance and allocation',
      text: 'Portfolio return is 8.4% and top allocation is 41.0%. Add to underweight positions to keep concentration from rising.'
    }
  ])(
    'evaluateAnswerQuality returns $expectedStatus',
    ({ expectedStatus, query, text }) => {
      expect(
        evaluateAnswerQuality({
          answer: text,
          query
        }).status
      ).toBe(expectedStatus);
    }
  );
});
