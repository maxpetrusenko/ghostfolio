import { AiAgentToolName } from './ai-agent.interfaces';
import { extractSymbolsFromQuery, normalizeIntentQuery } from './ai-agent.utils';

const FINANCE_READ_INTENT_KEYWORDS = [
  'account',
  'asset',
  'allocation',
  'balance',
  'benchmark',
  'cash',
  'concentration',
  'currency',
  'diversif',
  'equity',
  'exchange',
  'fx',
  'fundamental',
  'history',
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
  'symbol',
  'ticker',
  'tax',
  'compliance',
  'transaction',
  'valu',
  'worth'
];
const GREETING_ONLY_PATTERN =
  /^\s*(?:(?:hi|hello|hey)(?:\s+there)?|thanks|thank you|good morning|good afternoon|good evening)\s*[!.?]*\s*$/i;
const SIMPLE_ARITHMETIC_QUERY_PATTERN =
  /^\s*(?:what(?:'s| is)\s+)?[-+*/().\d\s%=]+\??\s*$/i;
const SIMPLE_ARITHMETIC_OPERATOR_PATTERN = /[+\-*/]/;
const SIMPLE_ARITHMETIC_PREFIX_PATTERN = /^\s*(?:what(?:'s| is)\s+)?/i;
const SIMPLE_ARITHMETIC_WORD_PREFIX_PATTERN =
  /^\s*(?:what(?:'s| is)\s+|calculate\s+|compute\s+)?/i;
const NUMBER_WORD_TO_DIGIT: Record<string, string> = {
  eight: '8',
  eleven: '11',
  five: '5',
  four: '4',
  nine: '9',
  one: '1',
  seven: '7',
  six: '6',
  ten: '10',
  three: '3',
  twelve: '12',
  two: '2',
  zero: '0'
};
const SIMPLE_ASSISTANT_QUERY_PATTERNS = [
  /^\s*(?:who am i|what is my name)\s*[!.?]*\s*$/i,
  /^\s*(?:who are you|what are you|what can you do)\s*[!.?]*\s*$/i,
  /^\s*(?:how do you work|how (?:can|do) i use (?:you|this))\s*[!.?]*\s*$/i,
  /^\s*(?:help|assist(?: me)?|what can you help with)\s*[!.?]*\s*$/i
];
const DIRECT_SELF_IDENTITY_QUERY_PATTERN = /\b(?:who am i|what is my name)\b/i;
const DIRECT_IDENTITY_QUERY_PATTERN = /\b(?:who are you|what are you)\b/i;
const DIRECT_USAGE_QUERY_PATTERN =
  /\b(?:how do you work|how (?:can|do) i use (?:you|this)|how should i ask)\b/i;
const DIRECT_CAPABILITY_QUERY_PATTERN =
  /\b(?:what can (?:you|i) do|help|assist(?: me)?|what can you help with)\b/i;
const TOOLS_DISCOVERY_QUERY_PATTERN =
  /^\s*(?:(?:help|show)\s+)?(?:tools?|commands?)\s*$/i;
const TOOLS_DISCOVERY_TOPIC_QUERY_PATTERN =
  /^\s*(?:tools?|commands?)\s+([a-z_]+)\s*$/i;
const OFF_DOMAIN_HEALTH_QUERY_PATTERN =
  /\b(?:health|medical|doctor|hospital|illness|disease|symptom|diagnos|therapy|medication|mental\s+health)\b/i;
const CONVERSATIONAL_ACKNOWLEDGMENT_PATTERN =
  /^\s*(?:oh\s+wow|wow|whoa|cool|nice|awesome|great|got it|ok(?:ay)?|interesting|alright)\b(?:.{0,30})?\s*[!.?]*\s*$/i;
const VAGUE_ORDER_QUERY_PATTERN =
  /\b(?:make an order|place an order|create an order|submit an order|buy|purchase|invest(?:\s+in)?)\b/i;
const DETAILED_ORDER_QUERY_PATTERN =
  /\b(?:buy|purchase|invest|order|create|place|submit)\b.*\b(?:\$?\s*\d+[,\d]*(?:\.\d+)?\s*(?:usd|eur|gbp|cad|chf|jpy|aud)|\d+[,\d]*(?:\.\d+)?\s+shares?|\d+[,\d]*(?:\.\d+)?\s+units?|\d+[,\d]*(?:\.\d+)?\b.*\bstocks?)\b/i;
const SEED_FUNDS_QUERY_PATTERN =
  /\b(?:seed(?:\s+my)?\s+(?:account|money|funds|data)|load\s+(?:test\s+)?(?:money|funds|cash|capital)|add(?:ing)?\s+test\s+(?:money|funds|cash|capital)|(?:add|load)\s+test\s+data|top[\s-]?up|fund(?:ing)?\s+(?:my\s+)?account|add\s+more\s+money|put\s+more\s+money|inject\s+more\s+money)\b/i;
const SEED_FUNDS_AMOUNT_PATTERN = /\$?\d+(?:,\d{3})*(?:\.\d{1,2})?/;
const REBALANCE_TARGET_DETAIL_PATTERN =
  /\b(?:\d{1,2}(?:\.\d{1,2})?\s*%|target\s+allocation|max(?:imum)?\s+position|80\s*\/\s*20|70\s*\/\s*30|60\s*\/\s*40)\b/i;
const REBALANCE_FUNDING_DETAIL_PATTERN =
  /\b(?:new\s+cash|cash|contribution|sell|trim|without\s+selling|with\s+selling)\b/i;
const REBALANCE_TAX_DETAIL_PATTERN =
  /\b(?:taxable|retirement|ira|401k|rrsp|tfsa|tax\s+sensit(?:ive|ivity)|tax\s+impact)\b/i;
const FOLLOW_UP_TOKEN_LIMIT = 12;
const FOLLOW_UP_STANDALONE_QUERY_PATTERNS = [
  /^\s*(?:why|how|how so|how come|and|then|so|anything else|what else|else)(?:\s+(?:now|today|latest|current|updated|update))?\s*[!.?]*\s*$/i,
  /^\s*(?:is that (?:it|all|everything)|only|(?:that'?s|that is) (?:all|everything)|just that)(?:\s+(?:you have|there|more))?\s*[!.?]*\s*$/i,
  /^\s*(?:show|show me|give|get|list|see)\s+(?:more|the rest|additional|all)(?:\s+(?:details?|info(?:rmation)?|data|about it))?\s*[!.?]*\s*$/i,
  /^\s*(?:what else|(?:and )?more|next|continue|keep going|anything else)(?:\s+(?:do you have|have you got|is there))?\s*[!.?]*\s*$/i
];
const FOLLOW_UP_CONTEXTUAL_QUERY_PATTERNS = [
  /^\s*(?:what about(?:\s+(?:that|this|it))?|why(?:\s+(?:that|this|it))?|how(?:\s+(?:that|this|it|about\s+that))?|can you explain(?:\s+(?:that|this|it))?|explain(?:\s+(?:that|this|it))?)(?:\s+(?:now|today|latest|current|updated|update))?\s*[!.?]*\s*$/i,
  /^\s*(?:should|can|could|would)\s+i(?:\s+\w+){0,3}\s+(?:that|this|it|those|these)\s*[!.?]*\s*$/i
];
const FOLLOW_UP_CONTEXT_MAX_AGE_IN_MS = 45 * 60 * 1000;
const FOLLOW_UP_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'i',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'so',
  'that',
  'the',
  'then',
  'these',
  'this',
  'those',
  'to',
  'we',
  'what',
  'why',
  'with',
  'you'
]);
const READ_ONLY_TOOLS = new Set<AiAgentToolName>([
  'account_overview',
  'activity_history',
  'demo_data',
  'exchange_rate',
  'get_asset_fundamentals',
  'get_current_holdings',
  'get_financial_news',
  'get_live_quote',
  'get_portfolio_risk_metrics',
  'get_portfolio_summary',
  'get_recent_transactions',
  'market_benchmarks',
  'price_history',
  'symbol_lookup',
  'calculate_rebalance_plan',
  'simulate_trade_impact',
  'transaction_categorize',
  'tax_estimate',
  'compliance_check',
  'portfolio_analysis',
  'risk_assessment',
  'market_data_lookup',
  'stress_test',
  'fire_analysis'
]);
const ALL_TOOL_NAMES: AiAgentToolName[] = [
  'portfolio_analysis',
  'risk_assessment',
  'market_data_lookup',
  'rebalance_plan',
  'stress_test',
  'fire_analysis',
  'account_overview',
  'exchange_rate',
  'get_portfolio_summary',
  'get_current_holdings',
  'get_portfolio_risk_metrics',
  'get_recent_transactions',
  'get_live_quote',
  'get_asset_fundamentals',
  'get_financial_news',
  'price_history',
  'symbol_lookup',
  'market_benchmarks',
  'activity_history',
  'demo_data',
  'create_account',
  'create_order',
  'seed_funds',
  'calculate_rebalance_plan',
  'simulate_trade_impact',
  'transaction_categorize',
  'tax_estimate',
  'compliance_check'
];
const TOOL_DISCOVERY_TOPICS: Record<
  string,
  {
    prompts: string[];
    tools: AiAgentToolName[];
  }
> = {
  account: {
    prompts: [
      'Show account overview and balances',
      'Show my portfolio summary and balances',
      'Show my current holdings'
    ],
    tools: ['account_overview', 'get_portfolio_summary', 'get_current_holdings']
  },
  compliance: {
    prompts: [
      'Run compliance check on my recent transactions (last 30 days)',
      'Scan my trades for compliance warnings (last 10 trades)',
      'Review policy violations in my portfolio activity since 2026-01-01'
    ],
    tools: ['get_recent_transactions', 'compliance_check']
  },
  fire: {
    prompts: [
      'Run a FIRE scenario with 15% higher savings',
      'When can I retire if I save 2500 USD monthly?',
      'Stress-test my FIRE plan with 4% inflation'
    ],
    tools: ['fire_analysis']
  },
  market: {
    prompts: [
      'Get latest quote and fundamentals for NVDA',
      'Show price history for AAPL over 1 year',
      'Show financial news for TSLA'
    ],
    tools: ['get_live_quote', 'get_asset_fundamentals', 'get_financial_news', 'price_history']
  },
  portfolio: {
    prompts: [
      'Analyze my portfolio allocation and concentration',
      'Assess portfolio risk and diversification',
      'Show benchmark comparison for my portfolio'
    ],
    tools: ['portfolio_analysis', 'risk_assessment', 'market_benchmarks']
  },
  tax: {
    prompts: [
      'Estimate tax impact for 5000 USD realized gains',
      'Estimate my taxes for this year',
      'Show tax estimate for income 120000 and deductions 20000'
    ],
    tools: ['tax_estimate']
  },
  transactions: {
    prompts: [
      'Show my recent transactions',
      'Categorize my recent transactions by type',
      'Summarize activity history for my latest trades'
    ],
    tools: ['get_recent_transactions', 'transaction_categorize', 'activity_history']
  }
};
const TOOL_DISCOVERY_TOPIC_ALIASES: Record<string, string> = {
  account: 'account',
  accounts: 'account',
  compliance: 'compliance',
  fire: 'fire',
  market: 'market',
  markets: 'market',
  news: 'market',
  order: 'transactions',
  orders: 'transactions',
  portfolio: 'portfolio',
  risk: 'portfolio',
  tax: 'tax',
  taxes: 'tax',
  transaction: 'transactions',
  transactions: 'transactions'
};
const TOOL_DISCOVERY_FALLBACK_TOPICS = Object.keys(TOOL_DISCOVERY_TOPICS).join(
  ', '
);
const TOOL_TOPIC_BY_INTENT: Partial<Record<AiAgentToolName, string>> = {
  account_overview: 'account',
  activity_history: 'transactions',
  compliance_check: 'compliance',
  fire_analysis: 'fire',
  get_asset_fundamentals: 'market',
  get_current_holdings: 'account',
  get_financial_news: 'market',
  get_live_quote: 'market',
  get_portfolio_summary: 'account',
  get_recent_transactions: 'transactions',
  market_benchmarks: 'portfolio',
  portfolio_analysis: 'portfolio',
  price_history: 'market',
  risk_assessment: 'portfolio',
  tax_estimate: 'tax',
  transaction_categorize: 'transactions'
};
const INTENT_TOOL_ALLOWLISTS: Record<
  'readOnly' | 'action',
  Set<AiAgentToolName>
> = {
  action: new Set(ALL_TOOL_NAMES),
  readOnly: READ_ONLY_TOOLS
};
const DEFAULT_MAX_TOOL_CALLS_PER_REQUEST = 8;
const DEFAULT_MAX_TOOL_CALLS_PER_TOOL: Partial<
  Record<AiAgentToolName, number>
> = {
  create_account: 1,
  create_order: 1,
  seed_funds: 1,
  compliance_check: 1,
  rebalance_plan: 1,
  calculate_rebalance_plan: 1,
  simulate_trade_impact: 1,
  stress_test: 1
};

export type AiAgentPolicyRoute = 'direct' | 'tools' | 'clarify';
export type AiAgentPolicyBlockReason =
  | 'none'
  | 'no_tool_query'
  | 'read_only'
  | 'needs_confirmation'
  | 'needs_rebalance_details'
  | 'needs_order_details'
  | 'needs_seed_funds_details'
  | 'unauthorized_access'
  | 'tool_rate_limit'
  | 'unknown';

export interface AiAgentToolPolicyDecision {
  blockedByPolicy: boolean;
  blockReason: AiAgentPolicyBlockReason;
  forcedDirect: boolean;
  plannedTools: AiAgentToolName[];
  limits?: {
    maxToolCallsPerRequest: number;
    maxToolCallsPerTool: Partial<Record<AiAgentToolName, number>>;
  };
  route: AiAgentPolicyRoute;
  toolsToExecute: AiAgentToolName[];
}

export interface AiAgentFollowUpResolverPreviousTurn {
  context?: {
    entities?: string[];
    goalType?: string;
    primaryScope?: string;
  };
  query: string;
  successfulTools: AiAgentToolName[];
  timestamp?: string;
}

export interface AiAgentFollowUpSignal {
  contextDependencyConfidence: number;
  isLikelyFollowUp: boolean;
  standaloneIntentConfidence: number;
  topicContinuityConfidence: number;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function tokenizeQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function getTokenOverlapRatio({
  currentTokens,
  previousTokens
}: {
  currentTokens: Set<string>;
  previousTokens: Set<string>;
}) {
  if (currentTokens.size === 0 || previousTokens.size === 0) {
    return 0;
  }

  let overlapCount = 0;

  for (const token of currentTokens) {
    if (previousTokens.has(token)) {
      overlapCount += 1;
    }
  }

  return overlapCount / Math.max(currentTokens.size, previousTokens.size);
}

export type DetailLevel = 'basic' | 'detailed' | 'extended';

export interface ShowMoreIntent {
  isShowMore: boolean;
  detailLevel: DetailLevel;
  targetTool?: AiAgentToolName;
}

const SHOW_MORE_PATTERNS = [
  /^\s*show(?:\s+me)?(?:\s+(?:more|the rest|additional|all))(?:\s+(?:details?|info(?:rmation)?|data|about it))?\s*[!.?]*\s*$/i,
  /^\s*(?:is that (?:it|all|everything)|only|(?:that'?s|that is) (?:all|everything)|just that)(?:\s+(?:you have|there|more))?\s*[!.?]*\s*$/i,
  /^\s*(?:what else|(?:and )?more|next|continue|keep going)(?:\s+(?:do you have|have you got|is there))?\s*[!.?]*\s*$/i,
  /^\s*(?:tell|give|get|list)\s+(?:me\s+)?more(?:\s+(?:about|details?|info))?\s*[!.?]*\s*$/i,
  /^\s*(?:more|additional|extra)(?:\s+(?:news|headlines|headlines?|stories|updates|articles))?\s*[!.?]*\s*$/i
];

const TOOL_DETAIL_CAPABILITIES: Partial<
  Record<AiAgentToolName, { maxItems: Record<DetailLevel, number> }>
> = {
  get_recent_transactions: {
    maxItems: { basic: 5, detailed: 15, extended: 50 }
  },
  get_financial_news: {
    maxItems: { basic: 3, detailed: 10, extended: 20 }
  },
  price_history: {
    maxItems: { basic: 30, detailed: 90, extended: 365 }
  }
};

export function detectShowMoreIntent({
  previousTurn,
  query
}: {
  previousTurn?: AiAgentFollowUpResolverPreviousTurn;
  query: string;
}): ShowMoreIntent {
  const normalizedQuery = query.trim().toLowerCase();

  const matchesShowMorePattern = SHOW_MORE_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });

  if (!matchesShowMorePattern || !previousTurn?.successfulTools.length) {
    return { isShowMore: false, detailLevel: 'basic' };
  }

  const previousTool = previousTurn.successfulTools[0];
  const capabilities = TOOL_DETAIL_CAPABILITIES[previousTool];

  if (capabilities) {
    return {
      isShowMore: true,
      detailLevel: 'extended',
      targetTool: previousTool
    };
  }

  return {
    isShowMore: true,
    detailLevel: 'detailed',
    targetTool: previousTool
  };
}

export function resolveFollowUpSignal({
  inferredPlannedTools,
  previousTurn,
  query
}: {
  inferredPlannedTools: AiAgentToolName[];
  previousTurn?: AiAgentFollowUpResolverPreviousTurn;
  query: string;
}): AiAgentFollowUpSignal {
  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = tokenizeQuery(normalizedQuery);
  const nonStopQueryTokens = new Set(
    queryTokens.filter((token) => {
      return !FOLLOW_UP_STOP_WORDS.has(token);
    })
  );
  const hasFinanceKeyword =
    includesKeyword({
      keywords: FINANCE_READ_INTENT_KEYWORDS,
      normalizedQuery
    }) ||
    /\b(?:fire|tax|rebalance|order|invest|holdings?)\b/.test(normalizedQuery);
  const hasDemonstrativeReference = /\b(?:that|this|it|those|these)\b/.test(
    normalizedQuery
  );
  const hasConnectorLead = /^(?:and|so|then|also|but)\b/.test(normalizedQuery);
  const hasModalReference = /^(?:should|can|could|would)\b/.test(
    normalizedQuery
  );
  const hasExplicitConstraint = /\b(?:usd|eur|chf|%|\d+)\b/.test(normalizedQuery);
  const hasStandaloneToolIntent = inferredPlannedTools.length > 0;

  let standaloneIntentConfidence = 0.15;
  if (hasStandaloneToolIntent) {
    standaloneIntentConfidence += 0.4;
  }
  if (hasFinanceKeyword) {
    standaloneIntentConfidence += 0.25;
  }
  if (hasExplicitConstraint) {
    standaloneIntentConfidence += 0.1;
  }
  if (queryTokens.length > FOLLOW_UP_TOKEN_LIMIT) {
    standaloneIntentConfidence += 0.1;
  }
  if (hasDemonstrativeReference && !hasFinanceKeyword) {
    standaloneIntentConfidence -= 0.2;
  }

  let contextDependencyConfidence = 0.05;
  if (hasDemonstrativeReference) {
    contextDependencyConfidence += 0.45;
  }
  if (queryTokens.length <= FOLLOW_UP_TOKEN_LIMIT) {
    contextDependencyConfidence += 0.2;
  }
  if (hasConnectorLead) {
    contextDependencyConfidence += 0.15;
  }
  if (hasModalReference && hasDemonstrativeReference) {
    contextDependencyConfidence += 0.15;
  }
  if (hasStandaloneToolIntent && hasFinanceKeyword) {
    contextDependencyConfidence -= 0.2;
  }

  let topicContinuityConfidence = 0;
  if (previousTurn) {
    const previousTokens = tokenizeQuery(previousTurn.query);
    const nonStopPreviousTokens = new Set(
      previousTokens.filter((token) => {
        return !FOLLOW_UP_STOP_WORDS.has(token);
      })
    );
    const overlapRatio = getTokenOverlapRatio({
      currentTokens: nonStopQueryTokens,
      previousTokens: nonStopPreviousTokens
    });
    const hasSuccessfulTools = previousTurn.successfulTools.length > 0;
    const queryEntities = extractInlineEntities(normalizedQuery);
    const previousEntities = new Set(
      (previousTurn.context?.entities ?? []).map((entity) => {
        return entity.toLowerCase();
      })
    );
    const hasEntityContinuity = queryEntities.some((entity) => {
      return previousEntities.has(entity.toLowerCase());
    });
    const recentContextBoost = (() => {
      const timestamp = previousTurn.timestamp
        ? Date.parse(previousTurn.timestamp)
        : Number.NaN;
      if (Number.isNaN(timestamp)) {
        return 0.05;
      }

      return Date.now() - timestamp <= FOLLOW_UP_CONTEXT_MAX_AGE_IN_MS
        ? 0.2
        : 0;
    })();

    topicContinuityConfidence =
      overlapRatio * 0.55 +
      (hasSuccessfulTools ? 0.2 : 0) +
      (hasDemonstrativeReference ? 0.15 : 0) +
      (hasEntityContinuity ? 0.1 : 0) +
      recentContextBoost;
  }

  const fallbackPatternMatch = isFollowUpQuery(query);
  const signal = {
    contextDependencyConfidence: clamp01(contextDependencyConfidence),
    standaloneIntentConfidence: clamp01(standaloneIntentConfidence),
    topicContinuityConfidence: clamp01(topicContinuityConfidence)
  };
  const isLikelyFollowUp =
    fallbackPatternMatch ||
    (signal.contextDependencyConfidence >= 0.55 &&
      signal.topicContinuityConfidence >= 0.35 &&
      signal.standaloneIntentConfidence < 0.75);

  return {
    ...signal,
    isLikelyFollowUp
  };
}

function extractInlineEntities(query: string) {
  const inlineEntityMatches = query.match(/\b[a-z]{2,8}\b/g) ?? [];
  const reservedTokens = new Set([
    'should',
    'would',
    'could',
    'can',
    'this',
    'that',
    'those',
    'these',
    'split'
  ]);

  return inlineEntityMatches.filter((token) => {
    return !reservedTokens.has(token);
  });
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
    SIMPLE_ARITHMETIC_OPERATOR_PATTERN.test(normalized) && /\d/.test(normalized)
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
    ) && /\b(?:portfolio|account|holdings?|balance|data)\b/.test(normalized);
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

  if (
    result === undefined ||
    cursor !== expression.length ||
    !Number.isFinite(result)
  ) {
    return undefined;
  }

  return result;
}

function evaluateSimpleArithmetic(query: string) {
  const normalized = query.trim();

  const numericExpression = normalized
    .replace(SIMPLE_ARITHMETIC_PREFIX_PATTERN, '')
    .replace(/\?+$/, '')
    .replace(/=/g, '')
    .trim();
  const wordNormalized = normalized
    .toLowerCase()
    .replace(SIMPLE_ARITHMETIC_WORD_PREFIX_PATTERN, '')
    .replace(/\bdivided by\b/g, '/')
    .replace(/\bmultiplied by\b/g, '*')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\btimes\b/g, '*')
    .replace(/\bover\b/g, '/')
    .replace(/\?+$/, '')
    .replace(/=/g, '')
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (token) => {
      return NUMBER_WORD_TO_DIGIT[token] ?? token;
    })
    .trim();
  const expressionCandidate =
    SIMPLE_ARITHMETIC_QUERY_PATTERN.test(normalized) &&
    SIMPLE_ARITHMETIC_OPERATOR_PATTERN.test(normalized) &&
    /\d/.test(normalized)
      ? numericExpression
      : wordNormalized;
  const expression = expressionCandidate;

  if (!expression) {
    return undefined;
  }

  if (
    !/^[\d+\-*/().\s]+$/.test(expression) ||
    !SIMPLE_ARITHMETIC_OPERATOR_PATTERN.test(expression) ||
    !/\d/.test(expression)
  ) {
    return undefined;
  }

  const result = evaluateArithmeticExpression(expression);

  if (result === undefined) {
    return undefined;
  }

  return `${expression} = ${formatNumericResult(result)}`;
}

interface ScoredIntentMatch {
  tool: AiAgentToolName;
  score: number;
}

function scoreReadOnlyIntents(query: string): ScoredIntentMatch[] {
  const normalized = normalizeIntentQuery(query);

  if (!normalized) {
    return [];
  }

  const intentPatterns: {
    requireAllRequired?: boolean;
    tool: AiAgentToolName;
    required: RegExp[];
    bonus: RegExp[];
    negative: RegExp[];
  }[] = [
    {
      tool: 'account_overview',
      required: [/\b(?:account|accounts?|balances?|cash)\b/i],
      bonus: [/\b(?:show|list|overview|summary|my)\b/i],
      negative: []
    },
    {
      tool: 'get_recent_transactions',
      required: [/\b(?:transactions?|txns?|trades?|orders?|activity|fills?|executions?)\b/i],
      bonus: [/\b(?:show|list|view|get|my|recent|latest|last|past)\b/i],
      negative: [/\b(?:create|place|submit)\b/i]
    },
    {
      tool: 'transaction_categorize',
      required: [/\b(?:categor(?:y|ies|ize)|classify|group)\b/i],
      bonus: [/\b(?:transactions?|trades?|orders?)\b/i],
      negative: []
    },
    {
      tool: 'portfolio_analysis',
      required: [/\b(?:portfolio|allocation|performance|return|invested|worth)\b/i],
      bonus: [/\b(?:show|analyze|review|summary|overview|my)\b/i],
      negative: []
    },
    {
      tool: 'risk_assessment',
      required: [/\b(?:risk|concentration|diversif|exposure)\b/i],
      bonus: [/\b(?:show|analyze|check|portfolio)\b/i],
      negative: []
    },
    {
      tool: 'tax_estimate',
      required: [/\b(?:tax|taxes|liability|owed|estimate)\b/i],
      bonus: [/\b(?:calculate|show|my|year|owe)\b/i],
      negative: []
    },
    {
      requireAllRequired: true,
      tool: 'compliance_check',
      required: [
        /\b(?:compliance|policy|regulation|regulatory)\b/i,
        /\b(?:check|review|scan|audit|verify|violations?|warnings?)\b/i
      ],
      bonus: [/\b(?:transactions?|trades?|orders?|activity|recent|latest)\b/i],
      negative: [/\b(?:disable|skip|bypass)\b/i]
    },
    {
      tool: 'get_live_quote',
      required: [/\b(?:quote|price|ticker|live)\b/i],
      bonus: [/\b(?:show|get|latest|current|symbol)\b/i],
      negative: []
    },
    {
      tool: 'get_financial_news',
      required: [/\b(?:news|headlines?|latest|update|updates)\b/i],
      bonus: [/\b(?:show|get|market|stock|for)\b/i],
      negative: []
    },
    {
      tool: 'get_asset_fundamentals',
      required: [/\b(?:fundamentals?|valuation|metrics?|dividend|market\s+cap|p\/?e)\b/i],
      bonus: [/\b(?:show|get|company|analysis)\b/i],
      negative: []
    },
    {
      tool: 'price_history',
      required: [/\b(?:history|historical|trend|chart)\b/i],
      bonus: [/\b(?:price|performance|1y|90d|30d)\b/i],
      negative: []
    },
    {
      tool: 'symbol_lookup',
      required: [/\b(?:symbol|ticker)\b/i],
      bonus: [/\b(?:lookup|find|what is)\b/i],
      negative: []
    },
    {
      tool: 'exchange_rate',
      required: [/\b(?:exchange|fx|currency|convert|conversion)\b/i],
      bonus: [/\b(?:rate|usd|eur|gbp|chf|jpy|cad|aud)\b/i],
      negative: []
    },
    {
      tool: 'market_benchmarks',
      required: [/\b(?:benchmark|benchmarks|index|indices)\b/i],
      bonus: [/\b(?:market|compare)\b/i],
      negative: []
    },
    {
      tool: 'fire_analysis',
      required: [/\b(?:fire|retire|retirement|financial\s+independence)\b/i],
      bonus: [/\b(?:plan|track|path|when)\b/i],
      negative: []
    }
  ];

  return intentPatterns
    .map((pattern) => {
      const requiredMatches = pattern.required.filter((regex) => {
        return regex.test(normalized);
      }).length;
      const hasRequired = pattern.requireAllRequired
        ? requiredMatches === pattern.required.length
        : requiredMatches > 0;

      if (!hasRequired) {
        return { score: 0, tool: pattern.tool };
      }

      let score = 0.5;
      const bonusMatches = pattern.bonus.filter((regex) => {
        return regex.test(normalized);
      }).length;
      score += Math.min(bonusMatches * 0.15, 0.3);

      const negativeMatches = pattern.negative.filter((regex) => {
        return regex.test(normalized);
      }).length;
      score -= negativeMatches * 0.5;

      return { score: Math.max(0, score), tool: pattern.tool };
    })
    .sort((a, b) => b.score - a.score);
}

function inferReadOnlyToolFromQuery(query: string): AiAgentToolName | null {
  const bestMatch = scoreReadOnlyIntents(query).find(({ score }) => {
    return score >= 0.4;
  });

  return bestMatch?.tool ?? null;
}

function inferClosestReadOnlyIntentFromQuery(
  query: string
): ScoredIntentMatch | null {
  const bestMatch = scoreReadOnlyIntents(query).find(({ score }) => {
    return score >= 0.25;
  });

  return bestMatch ?? null;
}

function createNoToolDirectResponse(query?: string) {
  const normalizedQuery = normalizeIntentQuery(query ?? '');
  const toolsTopicMatch =
    TOOLS_DISCOVERY_TOPIC_QUERY_PATTERN.exec(normalizedQuery);

  if (TOOLS_DISCOVERY_QUERY_PATTERN.test(normalizedQuery)) {
    return [
      'Available tool groups:',
      `- account: ${TOOL_DISCOVERY_TOPICS.account.tools.join(', ')}`,
      `- portfolio: ${TOOL_DISCOVERY_TOPICS.portfolio.tools.join(', ')}`,
      `- market: ${TOOL_DISCOVERY_TOPICS.market.tools.join(', ')}`,
      `- tax: ${TOOL_DISCOVERY_TOPICS.tax.tools.join(', ')}`,
      `- compliance: ${TOOL_DISCOVERY_TOPICS.compliance.tools.join(', ')}`,
      `- transactions: ${TOOL_DISCOVERY_TOPICS.transactions.tools.join(', ')}`,
      `- fire: ${TOOL_DISCOVERY_TOPICS.fire.tools.join(', ')}`,
      '',
      'Type "tools <topic>" for exact prompt templates. Example: "tools portfolio"'
    ].join('\n');
  }

  if (toolsTopicMatch) {
    const topic = TOOL_DISCOVERY_TOPIC_ALIASES[toolsTopicMatch[1]];
    if (!topic) {
      return [
        `Unknown tool topic "${toolsTopicMatch[1]}".`,
        `Try one of: ${TOOL_DISCOVERY_FALLBACK_TOPICS}.`
      ].join(' ');
    }

    const guidance = TOOL_DISCOVERY_TOPICS[topic];
    return [
      `Tool topic: ${topic}`,
      `Mapped tools: ${guidance.tools.join(', ')}`,
      'Exact prompts:',
      ...guidance.prompts.map((prompt) => {
        return `- "${prompt}"`;
      })
    ].join('\n');
  }

  if (CONVERSATIONAL_ACKNOWLEDGMENT_PATTERN.test(normalizedQuery)) {
    const hasFinanceToken = includesKeyword({
      keywords: FINANCE_READ_INTENT_KEYWORDS,
      normalizedQuery
    });
    const hasResolvedSymbol = extractSymbolsFromQuery(query ?? '').length > 0;

    if (!hasFinanceToken && !hasResolvedSymbol) {
      return [
        'Glad that helps!',
        '',
        'Ready to dive deeper. Try:',
        '- "Show my portfolio allocation"',
        '- "What is the latest on TSLA?"',
        '- "Estimate my taxes for this year"'
      ].join('\n');
    }
  }

  if (OFF_DOMAIN_HEALTH_QUERY_PATTERN.test(normalizedQuery)) {
    return [
      'I cannot help with medical issues.',
      'I can help with portfolio, tax, FIRE, and market questions.'
    ].join(' ');
  }

  if (GREETING_ONLY_PATTERN.test(normalizedQuery)) {
    return [
      'Hello! I am Ghostfolio AI. How can I help with your finances today?',
      '',
      'I can assist with:',
      '- Portfolio: total value, holdings, allocation, analysis',
      '- Risk: concentration assessment, stress testing, diversification',
      '- FIRE: retirement planning, safe withdrawal rates, savings scenarios',
      '- Taxes: estimate liabilities and review tax-related impacts',
      '- Market: live quotes, fundamentals, news for any symbol',
      '- Transactions: recent activity, categorization, tax estimates',
      '- Orders: place or simulate trades, build a sample order',
      '- Data: add test data or portfolio snapshots',
      '',
      'Try one of these:',
      '- "How is my portfolio performing?"',
      '- "Estimate my taxes for this year"',
      '- "Can I stay on track for FIRE?"',
      '- "How can I make an order?"',
      '- "Add test data for a quick check"'
    ].join('\n');
  }

  if (DIRECT_IDENTITY_QUERY_PATTERN.test(normalizedQuery)) {
    return [
      'I am Ghostfolio AI, your portfolio copilot for this account.',
      'I analyze concentration risk, summarize holdings, fetch quotes and fundamentals, pull recent transactions, simulate trade impact, and compose rebalance options.',
      'I answer with citations and I abstain when confidence is low or data is missing.',
      'Try one of these:',
      '- "Show me my portfolio allocation"',
      '- "Estimate taxes for income and gains"',
      '- "Run a FIRE scenario with higher saving"',
      '- "Create a paper order to test execution"',
      '- "Load test data for quick validation"'
    ].join('\n');
  }

  if (DIRECT_SELF_IDENTITY_QUERY_PATTERN.test(normalizedQuery)) {
    return [
      'I do not have access to personal identity details like your name.',
      'I can access only your portfolio data and chat context in this account.',
      'Try: "How much money do I have?" or "Show my top holdings."'
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
      'I am Ghostfolio AI. You can use me across several pages in Ghostfolio for different purposes:',
      '',
      'Pages with AI:',
      '- Portfolio Analysis (/portfolio/analysis): portfolio insights, risk assessment, allocation analysis',
      '- FIRE Calculator (/portfolio/fire): retirement planning, safe withdrawal rates, FIRE scenarios',
      '- Chat (/chat): dedicated AI chat interface for any financial questions',
      '',
      'What you can ask me:',
      '- Portfolio: balances, holdings, allocation, concentration',
      '- Taxes: tax estimates, withholding impact, gain/loss impact',
      '- FIRE: retirement timeline and savings scenarios',
      '- Portfolio actions: orders, rebalance direction, trade simulation',
      '- Data: review or load test data for checks',
      '',
      'Try these examples:',
      '- "Review my portfolio and tax impact"',
      '- "Am I on track for FIRE?"',
      '- "How do I place a test order?"',
      '- "Add a small set of test data and summarize it"'
    ].join('\n');
  }

  const closestIntent = inferClosestReadOnlyIntentFromQuery(query ?? '');
  if (closestIntent) {
    const guidanceTopic = TOOL_TOPIC_BY_INTENT[closestIntent.tool];
    const guidance = guidanceTopic
      ? TOOL_DISCOVERY_TOPICS[guidanceTopic]
      : undefined;

    return [
      'I could not map this safely from that wording alone.',
      `Closest intent: ${closestIntent.tool} (${Math.round(closestIntent.score * 100)}%)`,
      ...(guidance
        ? [
            'Try one of these exact prompts:',
            ...guidance.prompts.map((prompt) => {
              return `- "${prompt}"`;
            }),
            `Type "tools ${guidanceTopic}" for more templates.`
          ]
        : ['Try one concrete finance request with clear scope.'])
    ].join('\n');
  }

  return [
    'Insufficient confidence to provide a reliable answer from this query alone.',
    '',
    'Provide one concrete request so I can run the right checks safely.',
    '',
    'Useful formats:',
    '- "Analyze my portfolio allocation and concentration"',
    '- "Get latest quote and fundamentals for NVDA"',
    '- "Estimate tax impact for 5000 USD realized gains"',
    '- "Run a FIRE scenario with 15% higher savings"',
    '- "Explain why this result changed from last turn"',
    '',
    'I will return verified output with confidence and citations when enough context is available.'
  ].join('\n');
}

export function applyToolExecutionPolicy({
  followUpSignal,
  plannedTools,
  query,
  policyLimits
}: {
  followUpSignal?: Pick<AiAgentFollowUpSignal, 'isLikelyFollowUp'>;
  plannedTools: AiAgentToolName[];
  query: string;
  policyLimits?: {
    maxToolCallsPerRequest?: number;
    maxToolCallsPerTool?: Partial<Record<AiAgentToolName, number>>;
  };
}): AiAgentToolPolicyDecision {
  const normalizedQuery = normalizeIntentQuery(query);
  const deduplicatedPlannedTools = Array.from(new Set(plannedTools));
  const hasSeedFundsIntent = SEED_FUNDS_QUERY_PATTERN.test(query);
  const hasExplicitActionVerb = /\b(?:buy|sell|invest|allocate|rebalance|rebalancing|create|place|submit|open|make|trim|plan)\b/.test(
    normalizedQuery
  );
  const hasAllocateWithConstraint =
    /\ballocat(?:e|ion)\b/.test(normalizedQuery) &&
    /\b(?:\d|usd|eur|gbp|cad|chf|jpy|aud|target|max)\b/.test(normalizedQuery);
  const hasActionIntent =
    hasExplicitActionVerb || hasAllocateWithConstraint || hasSeedFundsIntent;
  const hasReadIntent = includesKeyword({
    keywords: FINANCE_READ_INTENT_KEYWORDS,
    normalizedQuery
  });
  const effectiveLimits = {
    maxToolCallsPerRequest:
      policyLimits?.maxToolCallsPerRequest ??
      DEFAULT_MAX_TOOL_CALLS_PER_REQUEST,
    maxToolCallsPerTool:
      policyLimits?.maxToolCallsPerTool ?? DEFAULT_MAX_TOOL_CALLS_PER_TOOL
  };
  const allowedToolsByIntent = hasActionIntent
    ? INTENT_TOOL_ALLOWLISTS.action
    : INTENT_TOOL_ALLOWLISTS.readOnly;

  if (isUnauthorizedPortfolioQuery(query)) {
    return {
      blockedByPolicy: deduplicatedPlannedTools.length > 0,
      blockReason: 'unauthorized_access',
      forcedDirect: true,
      plannedTools: deduplicatedPlannedTools,
      limits: effectiveLimits,
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
      limits: effectiveLimits,
      route: 'direct',
      toolsToExecute: []
    };
  }

  if (deduplicatedPlannedTools.length === 0) {
    const hasFollowUpIntent =
      (followUpSignal?.isLikelyFollowUp || isFollowUpQuery(query));

    if (hasReadIntent && !hasActionIntent) {
      const inferredTool = inferReadOnlyToolFromQuery(query);
      if (inferredTool && READ_ONLY_TOOLS.has(inferredTool)) {
        return {
          blockedByPolicy: false,
          blockReason: 'none',
          forcedDirect: false,
          plannedTools: [],
          limits: effectiveLimits,
          route: 'tools',
          toolsToExecute: [inferredTool]
        };
      }
    }

    return {
      blockedByPolicy: false,
      blockReason:
        hasReadIntent || hasActionIntent || hasFollowUpIntent
          ? 'unknown'
          : 'no_tool_query',
      forcedDirect: false,
      plannedTools: [],
      limits: effectiveLimits,
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
  const hasRebalancePlan = deduplicatedPlannedTools.includes('rebalance_plan');
  const explicitlyNeedsRebalanceDetails = /\brebalance\s+me\b/i.test(
    normalizedQuery
  );

  if (toolsToExecute.length > effectiveLimits.maxToolCallsPerRequest) {
    toolsToExecute = toolsToExecute.slice(
      0,
      effectiveLimits.maxToolCallsPerRequest
    );
    blockedByPolicy = true;
    blockReason = 'tool_rate_limit';
  }

  const allowedTools = toolsToExecute.filter((tool) => {
    return allowedToolsByIntent.has(tool);
  });
  if (allowedTools.length !== toolsToExecute.length) {
    toolsToExecute = allowedTools;
    blockedByPolicy = true;
    blockReason = blockReason === 'none' ? 'read_only' : blockReason;
  }

  if (toolsToExecute.includes('rebalance_plan')) {
    const hasRebalanceTargetDetails =
      REBALANCE_TARGET_DETAIL_PATTERN.test(query);
    const hasRebalanceFundingDetails =
      REBALANCE_FUNDING_DETAIL_PATTERN.test(query);
    const hasRebalanceTaxDetails = REBALANCE_TAX_DETAIL_PATTERN.test(query);
    const isMissingRebalanceDetails =
      !hasRebalanceTargetDetails ||
      !hasRebalanceFundingDetails ||
      !hasRebalanceTaxDetails;

    if (explicitlyNeedsRebalanceDetails && isMissingRebalanceDetails) {
      toolsToExecute = toolsToExecute.filter((tool) => {
        return tool !== 'rebalance_plan';
      });
      blockedByPolicy = true;
      blockReason = 'needs_rebalance_details';
    }
  }

  if (toolsToExecute.includes('create_order')) {
    const isVagueOrder = VAGUE_ORDER_QUERY_PATTERN.test(query);
    const hasDetails = DETAILED_ORDER_QUERY_PATTERN.test(query);

    if (isVagueOrder && !hasDetails) {
      toolsToExecute = toolsToExecute.filter((tool) => {
        return tool !== 'create_order';
      });
      blockedByPolicy = true;
      blockReason = 'needs_order_details';
    }
  }

  if (toolsToExecute.includes('seed_funds')) {
    const hasSeedFundsIntent = SEED_FUNDS_QUERY_PATTERN.test(query);
    const hasAmount = SEED_FUNDS_AMOUNT_PATTERN.test(query);

    if (hasSeedFundsIntent && !hasAmount) {
      toolsToExecute = toolsToExecute.filter((tool) => {
        return tool !== 'seed_funds';
      });
      blockedByPolicy = true;
      blockReason = 'needs_seed_funds_details';
    }
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

    if (hasRebalancePlan && !toolsToExecute.includes('rebalance_plan')) {
      blockReason =
        blockReason === 'none' || blockReason === 'read_only'
          ? 'needs_confirmation'
          : blockReason;
    }
  }

  if (toolsToExecute.length === 0) {
    const route: AiAgentPolicyRoute =
      blockedByPolicy || deduplicatedPlannedTools.length > 0
        ? 'clarify'
        : hasReadIntent || hasActionIntent
          ? 'clarify'
          : 'direct';

    return {
      blockedByPolicy: blockedByPolicy || deduplicatedPlannedTools.length > 0,
      blockReason:
        blockReason === 'none'
          ? route === 'clarify'
            ? 'unknown'
            : 'no_tool_query'
          : blockReason,
      forcedDirect: false,
      plannedTools: deduplicatedPlannedTools,
      limits: effectiveLimits,
      route,
      toolsToExecute: []
    };
  }

  return {
    blockedByPolicy,
    blockReason,
    forcedDirect: false,
    plannedTools: deduplicatedPlannedTools,
    limits: effectiveLimits,
    route: 'tools',
    toolsToExecute
  };
}

export function createPolicyRouteResponse({
  followUpSignal,
  policyDecision,
  query
}: {
  followUpSignal?: Pick<AiAgentFollowUpSignal, 'isLikelyFollowUp'>;
  policyDecision: AiAgentToolPolicyDecision;
  query?: string;
}) {
  if (policyDecision.route === 'clarify') {
    const normalizedQuery = query?.trim().toLowerCase() ?? '';
    const isConversationalAcknowledgment = Boolean(
      query && CONVERSATIONAL_ACKNOWLEDGMENT_PATTERN.test(normalizedQuery)
    );
    const hasFinanceToken = includesKeyword({
      keywords: FINANCE_READ_INTENT_KEYWORDS,
      normalizedQuery
    });
    const hasResolvedSymbol = extractSymbolsFromQuery(query ?? '').length > 0;

    if (
      isConversationalAcknowledgment &&
      !hasFinanceToken &&
      !hasResolvedSymbol
    ) {
      return `Glad that helps! What would you like to explore next? You can ask about your portfolio, specific stocks like TSLA or NVDA, tax estimates, or FIRE planning.`;
    }

    if (policyDecision.blockReason === 'needs_confirmation') {
      return `Please confirm your action goal so I can produce a concrete plan. Example: "Rebalance to keep each holding below 35%" or "Allocate 2000 USD across underweight positions."`;
    }

    if (policyDecision.blockReason === 'needs_order_details') {
      return `To create an order, please specify the amount. For example:
- "Buy 1000 USD of TSLA"
- "Purchase 50 shares of AAPL"
- "Invest 2000 EUR in MSFT"

Or review your portfolio first: "Show my holdings and cash balance"`;
    }

    if (policyDecision.blockReason === 'needs_seed_funds_details') {
      return `To add seed funds, provide a numeric amount in your request. For example:
"Add 1000 USD seed money"
"Top up account with 5000 for testing"
"Seed funds 250 EUR"`;
    }

    if (policyDecision.blockReason === 'needs_rebalance_details') {
      return `To create a rebalance plan, please include:
- target allocation or max position constraint
- funding method (new cash vs sell/trim)
- basic tax context (taxable vs retirement)

Example: "Rebalance to max 35% position, use new cash first, taxable account."`;
    }

    if (query && (followUpSignal?.isLikelyFollowUp ?? isFollowUpQuery(query))) {
      return `I can explain the previous result, but I need the target context. Ask a direct follow-up like "Why is my concentration high?" or "Explain that risk summary in detail."`;
    }

    return query
      ? createNoToolDirectResponse(query)
      : `Insufficient confidence to proceed safely with the current request. Share one concrete objective and scope (portfolio, symbol, tax, or FIRE), and include constraints if relevant.`;
  }

  if (
    policyDecision.route === 'direct' &&
    policyDecision.blockReason === 'no_tool_query'
  ) {
    const arithmeticResult = query
      ? evaluateSimpleArithmetic(query)
      : undefined;

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

  return `Insufficient confidence to answer this request safely. Please rephrase with a concrete finance objective so I can run verified checks.`;
}

export function formatPolicyVerificationDetails({
  policyDecision
}: {
  policyDecision: AiAgentToolPolicyDecision;
}) {
  const plannedTools =
    policyDecision.plannedTools.length > 0
      ? policyDecision.plannedTools.join(', ')
      : 'none';
  const executedTools =
    policyDecision.toolsToExecute.length > 0
      ? policyDecision.toolsToExecute.join(', ')
      : 'none';

  return `route=${policyDecision.route}; blocked_by_policy=${policyDecision.blockedByPolicy}; block_reason=${policyDecision.blockReason}; forced_direct=${policyDecision.forcedDirect}; planned_tools=${plannedTools}; executed_tools=${executedTools}`;
}
