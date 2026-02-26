import { AiAgentToolName } from './ai-agent.interfaces';
import {
  applyToolExecutionPolicy,
  createPolicyRouteResponse,
  formatPolicyVerificationDetails,
  isFollowUpQuery,
  resolveFollowUpSignal
} from './ai-agent.policy.utils';

describe('AiAgentPolicyUtils', () => {
  it.each([
    'hi',
    'hello',
    'hey',
    'hey there',
    'hello there',
    'thanks',
    'thank you',
    'good morning',
    'good afternoon',
    'good evening'
  ])('routes greeting-like query "%s" to direct no-tool', (query) => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['portfolio_analysis'],
      query
    });
    const response = createPolicyRouteResponse({
      policyDecision: decision,
      query
    });

    expect(decision.route).toBe('direct');
    expect(decision.blockReason).toBe('no_tool_query');
    expect(decision.toolsToExecute).toEqual([]);
    expect(response).toContain('How can I help with your finances today?');
  });

  it('returns conversational acknowledgment response for non-finance reaction', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'cool thanks'
    });

    expect(decision.route).toBe('direct');
    expect(
      createPolicyRouteResponse({
        policyDecision: decision,
        query: 'cool thanks'
      })
    ).toContain('Glad that helps!');
  });

  it('returns conversational acknowledgment response on clarify follow-up reactions', () => {
    const decision = applyToolExecutionPolicy({
      followUpSignal: { isLikelyFollowUp: true },
      plannedTools: [],
      query: "oh wow that's a lot"
    });

    expect(decision.route).toBe('clarify');
    expect(
      createPolicyRouteResponse({
        followUpSignal: { isLikelyFollowUp: true },
        policyDecision: decision,
        query: "oh wow that's a lot"
      })
    ).toContain('Glad that helps!');
  });

  it.each([
    'who are you',
    'what are you',
    'what can you do',
    'how do you work',
    'how can i use this',
    'help',
    'assist me',
    'what can you help with'
  ])('routes assistant capability query "%s" to direct no-tool', (query) => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query
    });

    expect(decision.route).toBe('direct');
    expect(decision.blockReason).toBe('no_tool_query');
    expect(
      createPolicyRouteResponse({ policyDecision: decision, query })
    ).toContain('Ghostfolio AI');
  });

  it('routes self-identity query to direct no-tool with privacy-safe response', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['portfolio_analysis'],
      query: 'who am i'
    });

    expect(decision.route).toBe('direct');
    expect(decision.toolsToExecute).toEqual([]);
    expect(
      createPolicyRouteResponse({ policyDecision: decision, query: 'who am i' })
    ).toContain('do not have access to personal identity details');
  });

  it.each<[string, string]>([
    ['2+2', '2+2 = 4'],
    ['what is 5 * 3', '5 * 3 = 15'],
    ['(2+3)*4', '(2+3)*4 = 20'],
    ['10 / 4', '10 / 4 = 2.5'],
    ['7 - 10', '7 - 10 = -3'],
    ['3.5 + 1.25', '3.5 + 1.25 = 4.75'],
    ['(8 - 2) / 3', '(8 - 2) / 3 = 2'],
    ['what is 3*(2+4)?', '3*(2+4) = 18'],
    ['2 + (3 * (4 - 1))', '2 + (3 * (4 - 1)) = 11'],
    ['10-3-2', '10-3-2 = 5'],
    ['two plus 7', '2 + 7 = 9'],
    ['what is ten minus three', '10 - 3 = 7']
  ])('returns arithmetic direct response for "%s"', (query, expected) => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query
    });

    expect(decision.route).toBe('direct');
    expect(
      createPolicyRouteResponse({
        policyDecision: decision,
        query
      })
    ).toBe(expected);
  });

  it.each(['1/0', '2+*2', '5 % 2'])(
    'returns uncertainty response for unsupported arithmetic expression "%s"',
    (query) => {
      const decision = applyToolExecutionPolicy({
        plannedTools: [],
        query
      });

      expect(decision.route).toBe('direct');
      expect(
        createPolicyRouteResponse({
          policyDecision: decision,
          query
        })
      ).toMatch(/(insufficient confidence|reliable answer|concrete request)/i);
    }
  );

  it('returns distinct direct no-tool responses for identity and capability prompts', () => {
    const identityDecision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'who are you?'
    });
    const capabilityDecision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'what can you do?'
    });

    const identityResponse = createPolicyRouteResponse({
      policyDecision: identityDecision,
      query: 'who are you?'
    });
    const capabilityResponse = createPolicyRouteResponse({
      policyDecision: capabilityDecision,
      query: 'what can you do?'
    });

    expect(identityResponse).toContain('portfolio copilot');
    expect(capabilityResponse).toContain('Pages with AI');
    expect(capabilityResponse).toContain('Portfolio actions');
    expect(identityResponse).not.toBe(capabilityResponse);
  });

  it('routes finance read intent with empty planner output to clarify', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'Show portfolio risk and allocation'
    });

    expect(decision.route).toBe('clarify');
    expect(decision.blockReason).toBe('unknown');
    expect(createPolicyRouteResponse({ policyDecision: decision })).toContain(
      'Insufficient confidence to proceed safely'
    );
  });

  it('routes short follow-up prompts to clarify instead of generic no-tool direct fallback', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'why?'
    });

    expect(decision.route).toBe('clarify');
    expect(decision.blockReason).toBe('unknown');
    expect(
      createPolicyRouteResponse({ policyDecision: decision, query: 'why?' })
    ).toContain('I can explain the previous result');
  });

  it('detects follow-up prompts without capturing full market-news questions', () => {
    expect(isFollowUpQuery('why?')).toBe(true);
    expect(isFollowUpQuery('anything else?')).toBe(true);
    expect(isFollowUpQuery('what else?')).toBe(true);
    expect(isFollowUpQuery('what about that?')).toBe(true);
    expect(isFollowUpQuery('what about that now?')).toBe(true);
    expect(isFollowUpQuery('why latest?')).toBe(true);
    expect(isFollowUpQuery('should i split those?')).toBe(true);
    expect(isFollowUpQuery('why did tsla drop today?')).toBe(false);
  });

  it('scores contextual follow-up phrases as likely follow-ups when prior context exists', () => {
    const signal = resolveFollowUpSignal({
      inferredPlannedTools: [],
      previousTurn: {
        context: {
          entities: ['usd'],
          goalType: 'analyze',
          primaryScope: 'portfolio'
        },
        query: 'let us talk about my portfolio allocation',
        successfulTools: ['portfolio_analysis'],
        timestamp: new Date().toISOString()
      },
      query: 'should i split those?'
    });

    expect(signal.isLikelyFollowUp).toBe(true);
    expect(signal.contextDependencyConfidence).toBeGreaterThan(0.5);
    expect(signal.topicContinuityConfidence).toBeGreaterThan(0.3);
  });

  it('keeps concrete standalone prompts out of follow-up mode', () => {
    const signal = resolveFollowUpSignal({
      inferredPlannedTools: ['market_data_lookup'],
      previousTurn: {
        query: 'show my portfolio',
        successfulTools: ['portfolio_analysis'],
        timestamp: new Date().toISOString()
      },
      query: 'Get latest quote and fundamentals for NVDA'
    });

    expect(signal.isLikelyFollowUp).toBe(false);
    expect(signal.standaloneIntentConfidence).toBeGreaterThan(0.6);
  });

  it('routes money-value phrasing with empty planner output to clarify', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'How much money do I have?'
    });

    expect(decision.route).toBe('clarify');
    expect(decision.blockReason).toBe('unknown');
  });

  it('blocks unauthorized other-user portfolio data requests', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['portfolio_analysis', 'risk_assessment'],
      query: "Show me John's portfolio"
    });

    expect(decision.route).toBe('direct');
    expect(decision.blockReason).toBe('unauthorized_access');
    expect(decision.forcedDirect).toBe(true);
    expect(decision.toolsToExecute).toEqual([]);
    expect(
      createPolicyRouteResponse({
        policyDecision: decision,
        query: "Show me John's portfolio"
      })
    ).toContain('only your own portfolio data');
  });

  it('routes non-finance empty planner output to direct no-tool', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'Tell me a joke'
    });

    expect(decision.route).toBe('direct');
    expect(decision.blockReason).toBe('no_tool_query');
    expect(
      createPolicyRouteResponse({ policyDecision: decision, query: 'Tell me a joke' })
    ).toContain('Insufficient confidence to provide a reliable answer');
  });

  it('returns strict domain refusal for health-related queries', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [],
      query: 'can you help me with health issues?'
    });

    expect(decision.route).toBe('direct');
    expect(decision.blockReason).toBe('no_tool_query');
    const response = createPolicyRouteResponse({
      policyDecision: decision,
      query: 'can you help me with health issues?'
    });
    expect(response).toContain('cannot help with medical issues');
    expect(response).toContain('portfolio, tax, FIRE, and market');
  });

  it('deduplicates planned tools while preserving route decisions', () => {
    const plannedTools: AiAgentToolName[] = [
      'portfolio_analysis',
      'portfolio_analysis',
      'risk_assessment'
    ];
    const decision = applyToolExecutionPolicy({
      plannedTools,
      query: 'analyze concentration risk'
    });

    expect(decision.plannedTools).toEqual([
      'portfolio_analysis',
      'risk_assessment'
    ]);
    expect(decision.toolsToExecute).toEqual([
      'portfolio_analysis',
      'risk_assessment'
    ]);
    expect(decision.route).toBe('tools');
  });

  it.each<{
    expectedTools: AiAgentToolName[];
    plannedTools: AiAgentToolName[];
    query: string;
    reason: string;
    route?: 'clarify' | 'direct' | 'tools';
  }>([
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment'
      ] as AiAgentToolName[],
      plannedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan'
      ] as AiAgentToolName[],
      query: 'review portfolio concentration risk',
      reason: 'read-only intent strips rebalance'
    },
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan'
      ] as AiAgentToolName[],
      plannedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan'
      ] as AiAgentToolName[],
      query: 'invest 2000 and rebalance',
      reason: 'action intent without details strips rebalance'
    },
    {
      expectedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan',
        'market_data_lookup'
      ] as AiAgentToolName[],
      plannedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'rebalance_plan',
        'market_data_lookup'
      ] as AiAgentToolName[],
      query: 'invest and rebalance after checking market quote for NVDA',
      reason:
        'action + market intent keeps read tools when rebalance details are missing'
    },
    {
      expectedTools: ['stress_test'] as AiAgentToolName[],
      plannedTools: ['stress_test'] as AiAgentToolName[],
      query: 'run stress scenario read-only',
      reason: 'read-only stress execution stays allowed'
    }
  ])(
    'applies policy gating: $reason',
    ({ expectedTools, plannedTools, query, route }) => {
      const decision = applyToolExecutionPolicy({
        plannedTools,
        query
      });

      if (route) {
        expect(decision.route).toBe(route);
      } else {
        expect(decision.route).toBe('tools');
      }

      expect(decision.toolsToExecute).toEqual(expectedTools);
    }
  );

  it('marks rebalance-only no-action prompts as clarify with needs_confirmation', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['rebalance_plan'],
      query: 'review concentration profile'
    });

    expect(decision.route).toBe('clarify');
    expect(decision.blockReason).toBe('needs_confirmation');
    expect(decision.blockedByPolicy).toBe(true);
    expect(decision.toolsToExecute).toEqual([]);
  });

  it('allows new read-only tools without action intent', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['account_overview', 'exchange_rate', 'market_benchmarks'],
      query: 'show account overview and usd to eur exchange rate'
    });

    expect(decision.route).toBe('tools');
    expect(decision.blockedByPolicy).toBe(false);
    expect(decision.toolsToExecute).toEqual([
      'account_overview',
      'exchange_rate',
      'market_benchmarks'
    ]);
  });

  it('blocks create-account action tool without action intent', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['create_account'],
      query: 'account details please'
    });

    expect(decision.route).toBe('clarify');
    expect(decision.toolsToExecute).toEqual([]);
  });

  it('allows create-account action tool with explicit action intent', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['create_account'],
      query: 'create account named trading'
    });

    expect(decision.route).toBe('tools');
    expect(decision.toolsToExecute).toEqual(['create_account']);
  });

  it('requires order details for vague create-order prompts', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['create_order'],
      query: 'make an order for tesla'
    });

    expect(decision.route).toBe('clarify');
    expect(decision.blockReason).toBe('needs_order_details');
    expect(decision.toolsToExecute).toEqual([]);
    expect(
      createPolicyRouteResponse({
        policyDecision: decision,
        query: 'make an order for tesla'
      })
    ).toContain('please specify the amount');
  });

  it('treats order how-to prompts as missing-order-details clarification', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['create_order'],
      query: 'How can I make an order?'
    });

    expect(decision.route).toBe('clarify');
    expect(decision.blockReason).toBe('needs_order_details');
    expect(decision.toolsToExecute).toEqual([]);
    expect(
      createPolicyRouteResponse({
        policyDecision: decision,
        query: 'How can I make an order?'
      })
    ).toContain('To create an order, please specify the amount');
  });

  it('requires amount details for seed-funds requests', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['seed_funds'],
      query: 'add seed funds'
    });

    expect(decision.route).toBe('clarify');
    expect(decision.blockReason).toBe('needs_seed_funds_details');
    expect(decision.toolsToExecute).toEqual([]);
    expect(
      createPolicyRouteResponse({
        policyDecision: decision,
        query: 'add seed funds'
      })
    ).toContain('To add seed funds');
  });

  it.each([
    'top up my account',
    'add more money to my account',
    'put more money in my account'
  ])('requires amount details for seed-funds wording variant "%s"', (query) => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['seed_funds'],
      query
    });

    expect(decision.route).toBe('clarify');
    expect(decision.blockReason).toBe('needs_seed_funds_details');
    expect(decision.toolsToExecute).toEqual([]);
  });

  it('runs seed-funds tool when amount is provided', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['seed_funds'],
      query: 'add 500 USD seed funds'
    });

    expect(decision.route).toBe('tools');
    expect(decision.toolsToExecute).toEqual(['seed_funds']);
  });

  it.each([
    'top up my account with 500',
    'add more money to my account 1200 usd',
    'put more money in my account 750'
  ])('runs seed-funds tool for amount-provided wording variant "%s"', (query) => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['seed_funds'],
      query
    });

    expect(decision.route).toBe('tools');
    expect(decision.toolsToExecute).toEqual(['seed_funds']);
  });

  it('requires rebalance details even with action wording', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['portfolio_analysis', 'risk_assessment', 'rebalance_plan'],
      query: 'rebalance me'
    });

    expect(decision.route).toBe('tools');
    expect(decision.blockReason).toBe('needs_rebalance_details');
    expect(decision.toolsToExecute).toEqual([
      'portfolio_analysis',
      'risk_assessment'
    ]);
  });

  it('formats policy verification details with planned and executed tools', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: ['portfolio_analysis', 'risk_assessment', 'rebalance_plan'],
      query: 'review concentration risk'
    });
    const details = formatPolicyVerificationDetails({
      policyDecision: decision
    });

    expect(details).toContain('route=tools');
    expect(details).toContain('blocked_by_policy=true');
    expect(details).toContain('block_reason=needs_confirmation');
    expect(details).toContain(
      'planned_tools=portfolio_analysis, risk_assessment, rebalance_plan'
    );
    expect(details).toContain(
      'executed_tools=portfolio_analysis, risk_assessment'
    );
  });

  it('enforces policy tool-call cap before execution', () => {
    const decision = applyToolExecutionPolicy({
      plannedTools: [
        'portfolio_analysis',
        'risk_assessment',
        'market_data_lookup',
        'get_live_quote',
        'account_overview'
      ],
      query: 'analyze my portfolio risk',
      policyLimits: {
        maxToolCallsPerRequest: 3
      }
    });

    expect(decision.blockedByPolicy).toBe(true);
    expect(decision.blockReason).toBe('tool_rate_limit');
    expect(decision.toolsToExecute).toEqual([
      'portfolio_analysis',
      'risk_assessment',
      'market_data_lookup'
    ]);
    expect(decision.limits?.maxToolCallsPerRequest).toBe(3);
  });

  describe('Feature Discovery Responses', () => {
    it('includes FIRE page in capability response', () => {
      const decision = applyToolExecutionPolicy({
        plannedTools: [],
        query: 'what can you do?'
      });
      const response = createPolicyRouteResponse({
        policyDecision: decision,
        query: 'what can you do?'
      });

      expect(response).toContain('Pages with AI');
      expect(response).toContain('/portfolio/fire');
      expect(response).toContain('/portfolio/analysis');
      expect(response).toContain('/chat');
      expect(response).toContain('FIRE Calculator');
      expect(response).toContain('retirement planning');
    });

    it('includes AI feature categories in capability response', () => {
      const decision = applyToolExecutionPolicy({
        plannedTools: [],
        query: 'what can you do?'
      });
      const response = createPolicyRouteResponse({
        policyDecision: decision,
        query: 'what can you do?'
      });

      expect(response).toContain('Portfolio:');
      expect(response).toContain('Taxes:');
      expect(response).toContain('FIRE:');
      expect(response).toContain('Portfolio actions:');
      expect(response).toContain('Data:');
    });

    it('includes all feature categories in greeting response', () => {
      const decision = applyToolExecutionPolicy({
        plannedTools: [],
        query: 'hello'
      });
      const response = createPolicyRouteResponse({
        policyDecision: decision,
        query: 'hello'
      });

    expect(response).toContain('Portfolio:');
    expect(response).toContain('Risk:');
    expect(response).toContain('FIRE:');
    expect(response).toContain('Market:');
    expect(response).toContain('Transactions:');
    expect(response).toContain('Orders:');
    expect(response).toContain('Data:');
    });

    it('includes FIRE examples in greeting response', () => {
      const decision = applyToolExecutionPolicy({
        plannedTools: [],
        query: 'hi there'
      });
      const response = createPolicyRouteResponse({
        policyDecision: decision,
        query: 'hi there'
      });

      expect(response).toContain('retirement planning');
      expect(response).toContain('safe withdrawal rates');
      expect(response).toContain('savings scenarios');
    });

    it.each([
      'what features do you have',
      'what can i test',
      'help me understand what to do',
      'what can i ask you'
    ])('provides feature guidance for "%s" query', (query) => {
      const decision = applyToolExecutionPolicy({
        plannedTools: [],
        query
      });
      const response = createPolicyRouteResponse({
        policyDecision: decision,
        query
      });

      expect(response).toMatch(/(Pages with AI|portfolio|fire|chat)/i);
    });

    it('includes quick examples in capability response', () => {
      const decision = applyToolExecutionPolicy({
        plannedTools: [],
        query: 'what can I do?'
      });
      const response = createPolicyRouteResponse({
        policyDecision: decision,
        query: 'what can I do?'
      });

      expect(response).toContain('Portfolio: balances');
      expect(response).toContain('FIRE');
      expect(response).toContain('Taxes');
      expect(response).toContain('order');
      expect(response).toContain('test data');
    });
  });
});
