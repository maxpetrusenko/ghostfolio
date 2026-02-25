import { AiAgentToolName } from './ai-agent.interfaces';

const FINANCE_READ_INTENT_KEYWORDS = [
  'asset',
  'allocation',
  'balance',
  'cash',
  'concentration',
  'diversif',
  'equity',
  'fundamental',
  'holding',
  'market',
  'money',
  'news',
  'performance',
  'portfolio',
  'price',
  'quote',
  'return',
  'risk',
  'stress',
  'ticker',
  'tax',
  'compliance',
  'transaction',
  'valu',
  'worth'
];
const REBALANCE_CONFIRMATION_KEYWORDS = [
  'allocat',
  'buy',
  'invest',
  'rebalanc',
  'sell',
  'trim'
];
const GREETING_ONLY_PATTERN =
  /^\s*(?:(?:hi|hello|hey)(?:\s+there)?|thanks|thank you|good morning|good afternoon|good evening)\s*[!.?]*\s*$/i;
const SIMPLE_ARITHMETIC_QUERY_PATTERN =
  /^\s*(?:what(?:'s| is)\s+)?[-+*/().\d\s%=]+\??\s*$/i;
const SIMPLE_ARITHMETIC_OPERATOR_PATTERN = /[+\-*/]/;
const SIMPLE_ARITHMETIC_PREFIX_PATTERN = /^\s*(?:what(?:'s| is)\s+)?/i;
const SIMPLE_ASSISTANT_QUERY_PATTERNS = [
  /^\s*(?:who are you|what are you|what can you do)\s*[!.?]*\s*$/i,
  /^\s*(?:how do you work|how (?:can|do) i use (?:you|this))\s*[!.?]*\s*$/i,
  /^\s*(?:help|assist(?: me)?|what can you help with)\s*[!.?]*\s*$/i
];
const DIRECT_IDENTITY_QUERY_PATTERN = /\b(?:who are you|what are you)\b/i;
const DIRECT_USAGE_QUERY_PATTERN =
  /\b(?:how do you work|how (?:can|do) i use (?:you|this)|how should i ask)\b/i;
const DIRECT_CAPABILITY_QUERY_PATTERN =
  /\b(?:what can (?:you|i) do|help|assist(?: me)?|what can you help with)\b/i;
const FOLLOW_UP_TOKEN_LIMIT = 6;
const FOLLOW_UP_STANDALONE_QUERY_PATTERNS = [
  /^\s*(?:why|how|how so|how come|and|then|so)\s*[!.?]*\s*$/i
];
const FOLLOW_UP_CONTEXTUAL_QUERY_PATTERNS = [
  /^\s*(?:what about(?:\s+(?:that|this|it))?|why(?:\s+(?:that|this|it))?|how(?:\s+(?:that|this|it|about\s+that))?|can you explain(?:\s+(?:that|this|it))?|explain(?:\s+(?:that|this|it))?)\s*[!.?]*\s*$/i
];
const READ_ONLY_TOOLS = new Set<AiAgentToolName>([
  'get_asset_fundamentals',
  'get_article_content',
  'get_current_holdings',
  'get_financial_news',
  'get_live_quote',
  'get_portfolio_risk_metrics',
  'get_portfolio_summary',
  'get_recent_transactions',
  'calculate_rebalance_plan',
  'simulate_trade_impact',
  'transaction_categorize',
  'tax_estimate',
  'compliance_check',
  'portfolio_analysis',
  'risk_assessment',
  'market_data_lookup',
  'stress_test'
]);

export type AiAgentPolicyRoute = 'direct' | 'tools' | 'clarify';
export type AiAgentPolicyBlockReason =
  | 'none'
  | 'no_tool_query'
  | 'read_only'
  | 'needs_confirmation'
  | 'unauthorized_access'
  | 'unknown';

export interface AiAgentToolPolicyDecision {
  blockedByPolicy: boolean;
  blockReason: AiAgentPolicyBlockReason;
  forcedDirect: boolean;
  plannedTools: AiAgentToolName[];
  route: AiAgentPolicyRoute;
  toolsToExecute: AiAgentToolName[];
}

function includesKeyword({
  keywords,
  normalizedQuery
}: {
  keywords: readonly string[];
  normalizedQuery: string;
}) {
  return keywords.some((keyword) => {
    return normalizedQuery.includes(keyword);
  });
}

function isNoToolDirectQuery(query: string) {
  if (GREETING_ONLY_PATTERN.test(query)) {
    return true;
  }

  if (
    SIMPLE_ASSISTANT_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(query);
    })
  ) {
    return true;
  }

  const normalized = query.trim();

  if (!SIMPLE_ARITHMETIC_QUERY_PATTERN.test(normalized)) {
    return false;
  }

  return (
    SIMPLE_ARITHMETIC_OPERATOR_PATTERN.test(normalized) &&
    /\d/.test(normalized)
  );
}

export function isFollowUpQuery(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return false;
  }

  const normalizedTokens = normalizedQuery
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (
    normalizedTokens.length === 0 ||
    normalizedTokens.length > FOLLOW_UP_TOKEN_LIMIT
  ) {
    return false;
  }

  return (
    FOLLOW_UP_STANDALONE_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    }) ||
    FOLLOW_UP_CONTEXTUAL_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    })
  );
}

function isUnauthorizedPortfolioQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  const referencesOtherUserData =
    /\b(?:john'?s|someone else'?s|another user'?s|other users'?|all users'?|everyone'?s|their)\b/.test(
      normalized
    ) &&
    /\b(?:portfolio|account|holdings?|balance|data)\b/.test(normalized);
  const requestsSystemWideData =
    /\bwhat portfolios do you have access to\b/.test(normalized) ||
    /\bshow all (?:users|portfolios|accounts)\b/.test(normalized);

  return referencesOtherUserData || requestsSystemWideData;
}

function formatNumericResult(value: number) {
  if (Math.abs(value) < Number.EPSILON) {
    return '0';
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(6).replace(/\.?0+$/, '');
}

function evaluateArithmeticExpression(expression: string) {
  let cursor = 0;

  const skipWhitespace = () => {
    while (cursor < expression.length && /\s/.test(expression[cursor])) {
      cursor += 1;
    }
  };

  const parseNumber = () => {
    skipWhitespace();
    const start = cursor;
    let dotCount = 0;

    while (cursor < expression.length) {
      const token = expression[cursor];

      if (token >= '0' && token <= '9') {
        cursor += 1;
        continue;
      }

      if (token === '.') {
        dotCount += 1;

        if (dotCount > 1) {
          return undefined;
        }

        cursor += 1;
        continue;
      }

      break;
    }

    if (start === cursor) {
      return undefined;
    }

    const parsed = Number(expression.slice(start, cursor));

    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseFactor = (): number | undefined => {
    skipWhitespace();

    if (expression[cursor] === '+') {
      cursor += 1;
      return parseFactor();
    }

    if (expression[cursor] === '-') {
      cursor += 1;
      const nested = parseFactor();

      return nested === undefined ? undefined : -nested;
    }

    if (expression[cursor] === '(') {
      cursor += 1;
      const nested = parseExpression();

      skipWhitespace();
      if (nested === undefined || expression[cursor] !== ')') {
        return undefined;
      }

      cursor += 1;
      return nested;
    }

    return parseNumber();
  };

  const parseTerm = (): number | undefined => {
    let value = parseFactor();

    if (value === undefined) {
      return undefined;
    }

    while (true) {
      skipWhitespace();
      const operator = expression[cursor];

      if (operator !== '*' && operator !== '/') {
        break;
      }

      cursor += 1;
      const right = parseFactor();

      if (right === undefined) {
        return undefined;
      }

      if (operator === '*') {
        value *= right;
      } else {
        if (Math.abs(right) < Number.EPSILON) {
          return undefined;
        }

        value /= right;
      }
    }

    return value;
  };

  const parseExpression = (): number | undefined => {
    let value = parseTerm();

    if (value === undefined) {
      return undefined;
    }

    while (true) {
      skipWhitespace();
      const operator = expression[cursor];

      if (operator !== '+' && operator !== '-') {
        break;
      }

      cursor += 1;
      const right = parseTerm();

      if (right === undefined) {
        return undefined;
      }

      if (operator === '+') {
        value += right;
      } else {
        value -= right;
      }
    }

    return value;
  };

  const result = parseExpression();

  skipWhitespace();

  if (result === undefined || cursor !== expression.length || !Number.isFinite(result)) {
    return undefined;
  }

  return result;
}

function evaluateSimpleArithmetic(query: string) {
  const normalized = query.trim();

  if (
    !SIMPLE_ARITHMETIC_QUERY_PATTERN.test(normalized) ||
    !SIMPLE_ARITHMETIC_OPERATOR_PATTERN.test(normalized) ||
    !/\d/.test(normalized)
  ) {
    return undefined;
  }

  const expression = normalized
    .replace(SIMPLE_ARITHMETIC_PREFIX_PATTERN, '')
    .replace(/\?+$/, '')
    .replace(/=/g, '')
    .trim();

  if (!expression) {
    return undefined;
  }

  const result = evaluateArithmeticExpression(expression);

  if (result === undefined) {
    return undefined;
  }

  return `${expression} = ${formatNumericResult(result)}`;
}

function createNoToolDirectResponse(query?: string) {
  const normalizedQuery = query?.trim().toLowerCase() ?? '';

  if (GREETING_ONLY_PATTERN.test(normalizedQuery)) {
    return [
      'Hello! I am Ghostfolio AI. How can I help with your finances today?',
      'I can check your portfolio value, holdings, risk, quotes, fundamentals, news, and recent transactions.',
      'Try one of these:',
      '- "How much money do I have?"',
      '- "Show my top holdings"',
      '- "What is my concentration risk?"',
      '- "Get fundamentals and news for MSFT"'
    ].join('\n');
  }

  if (DIRECT_IDENTITY_QUERY_PATTERN.test(normalizedQuery)) {
    return [
      'I am Ghostfolio AI, your portfolio copilot for this account.',
      'I analyze concentration risk, summarize holdings, fetch quotes and fundamentals, pull recent transactions, simulate trade impact, and compose rebalance options.',
      'I answer with citations and I abstain when confidence is low or data is missing.',
      'Try one of these:',
      '- "Give me a concentration risk summary"',
      '- "Show my recent transactions"',
      '- "Get fundamentals and news for NVDA"',
      '- "Simulate trade impact if I buy 1000 USD of MSFT"'
    ].join('\n');
  }

  if (DIRECT_USAGE_QUERY_PATTERN.test(normalizedQuery)) {
    return [
      'I am Ghostfolio AI. Use short direct prompts and include your goal or constraint.',
      'Good pattern: objective + scope + constraint (for example, "reduce top holding below 35% with low tax impact").',
      'I can return analysis, recommendation options, stress scenarios, and market snapshots with citations.',
      'If key constraints are missing, I will ask up to 3 follow-up questions before giving trade-style steps.'
    ].join('\n');
  }

  if (DIRECT_CAPABILITY_QUERY_PATTERN.test(normalizedQuery)) {
    return [
      'I am Ghostfolio AI. You can use me in four modes: diagnose, explain, plan, and verify.',
      'Diagnose: portfolio summary, current holdings, risk metrics, and recent transactions.',
      'Explain: live quotes, fundamentals, and news headlines for symbols.',
      'Plan: rebalance calculations and what-if trade-impact simulations.',
      'Verify: citation-backed answers, confidence gating, and strict own-account data access.',
      'Try next:',
      '- "Analyze my concentration risk"',
      '- "Show my recent transactions and current holdings"',
      '- "Get live quote, fundamentals, and news for AAPL"',
      '- "Calculate rebalance plan to keep each holding below 35%"',
      '- "Simulate trade impact if I invest 2000 USD into VTI"'
    ].join('\n');
  }

  return [
    'I am Ghostfolio AI. I can help with portfolio analysis, concentration risk, market prices, fundamentals, news, transaction history, and rebalance simulations.',
    'Try one of these:',
    '- "Show my top holdings"',
    '- "What is my concentration risk?"',
    '- "Show my recent transactions"',
    '- "Get fundamentals for MSFT"',
    '- "Help me diversify with actionable options"'
  ].join('\n');
}

export function applyToolExecutionPolicy({
  plannedTools,
  query
}: {
  plannedTools: AiAgentToolName[];
  query: string;
}): AiAgentToolPolicyDecision {
  const normalizedQuery = query.toLowerCase();
  const deduplicatedPlannedTools = Array.from(new Set(plannedTools));
  const hasActionIntent = includesKeyword({
    keywords: REBALANCE_CONFIRMATION_KEYWORDS,
    normalizedQuery
  });
  const hasReadIntent = includesKeyword({
    keywords: FINANCE_READ_INTENT_KEYWORDS,
    normalizedQuery
  });

  if (isUnauthorizedPortfolioQuery(query)) {
    return {
      blockedByPolicy: deduplicatedPlannedTools.length > 0,
      blockReason: 'unauthorized_access',
      forcedDirect: true,
      plannedTools: deduplicatedPlannedTools,
      route: 'direct',
      toolsToExecute: []
    };
  }

  if (isNoToolDirectQuery(query)) {
    return {
      blockedByPolicy: deduplicatedPlannedTools.length > 0,
      blockReason: 'no_tool_query',
      forcedDirect: deduplicatedPlannedTools.length > 0,
      plannedTools: deduplicatedPlannedTools,
      route: 'direct',
      toolsToExecute: []
    };
  }

  if (deduplicatedPlannedTools.length === 0) {
    const hasFollowUpIntent = isFollowUpQuery(query);

    return {
      blockedByPolicy: false,
      blockReason:
        hasReadIntent || hasActionIntent || hasFollowUpIntent
          ? 'unknown'
          : 'no_tool_query',
      forcedDirect: false,
      plannedTools: [],
      route:
        hasReadIntent || hasActionIntent || hasFollowUpIntent
          ? 'clarify'
          : 'direct',
      toolsToExecute: []
    };
  }

  let toolsToExecute = deduplicatedPlannedTools;
  let blockedByPolicy = false;
  let blockReason: AiAgentPolicyBlockReason = 'none';

  if (!hasActionIntent && toolsToExecute.includes('rebalance_plan')) {
    toolsToExecute = toolsToExecute.filter((tool) => {
      return tool !== 'rebalance_plan';
    });
    blockedByPolicy = true;
    blockReason = 'needs_confirmation';
  }

  if (!hasActionIntent) {
    const readOnlyTools = toolsToExecute.filter((tool) => {
      return READ_ONLY_TOOLS.has(tool);
    });

    if (readOnlyTools.length !== toolsToExecute.length) {
      toolsToExecute = readOnlyTools;
      blockedByPolicy = true;
      blockReason = blockReason === 'none' ? 'read_only' : blockReason;
    }
  }

  if (toolsToExecute.length === 0) {
    const route: AiAgentPolicyRoute = hasReadIntent || hasActionIntent
      ? 'clarify'
      : 'direct';

    return {
      blockedByPolicy: blockedByPolicy || deduplicatedPlannedTools.length > 0,
      blockReason: blockReason === 'none'
        ? route === 'clarify'
          ? 'unknown'
          : 'no_tool_query'
        : blockReason,
      forcedDirect: route === 'direct',
      plannedTools: deduplicatedPlannedTools,
      route,
      toolsToExecute: []
    };
  }

  return {
    blockedByPolicy,
    blockReason,
    forcedDirect: false,
    plannedTools: deduplicatedPlannedTools,
    route: 'tools',
    toolsToExecute
  };
}

export function createPolicyRouteResponse({
  policyDecision,
  query
}: {
  policyDecision: AiAgentToolPolicyDecision;
  query?: string;
}) {
  if (policyDecision.route === 'clarify') {
    if (policyDecision.blockReason === 'needs_confirmation') {
      return `Please confirm your action goal so I can produce a concrete plan. Example: "Rebalance to keep each holding below 35%" or "Allocate 2000 USD across underweight positions."`;
    }

    if (query && isFollowUpQuery(query)) {
      return `I can explain the previous result, but I need the target context. Ask a direct follow-up like "Why is my concentration high?" or "Explain that risk summary in detail."`;
    }

    return `I can help with allocation review, concentration risk, market prices, and stress scenarios. Which one should I run next? Example: "Show concentration risk" or "Price for NVDA".`;
  }

  if (
    policyDecision.route === 'direct' &&
    policyDecision.blockReason === 'no_tool_query'
  ) {
    const arithmeticResult = query ? evaluateSimpleArithmetic(query) : undefined;

    if (arithmeticResult) {
      return arithmeticResult;
    }

    return createNoToolDirectResponse(query);
  }

  if (
    policyDecision.route === 'direct' &&
    policyDecision.blockReason === 'unauthorized_access'
  ) {
    return `I can access only your own portfolio data in this account. Ask about your holdings, balance, risk, or allocation and I will help.`;
  }

  return `I can help with portfolio analysis, concentration risk, market prices, and stress scenarios. Ask a portfolio question when you are ready.`;
}

export function formatPolicyVerificationDetails({
  policyDecision
}: {
  policyDecision: AiAgentToolPolicyDecision;
}) {
  const plannedTools = policyDecision.plannedTools.length > 0
    ? policyDecision.plannedTools.join(', ')
    : 'none';
  const executedTools = policyDecision.toolsToExecute.length > 0
    ? policyDecision.toolsToExecute.join(', ')
    : 'none';

  return `route=${policyDecision.route}; blocked_by_policy=${policyDecision.blockedByPolicy}; block_reason=${policyDecision.blockReason}; forced_direct=${policyDecision.forcedDirect}; planned_tools=${plannedTools}; executed_tools=${executedTools}`;
}
