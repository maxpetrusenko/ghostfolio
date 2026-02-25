import {
  AiAgentConfidence,
  AiAgentToolCall,
  AiAgentToolName,
  AiAgentVerificationCheck
} from './ai-agent.interfaces';

const CANDIDATE_TICKER_PATTERN = /\$?[A-Za-z0-9.]{1,10}/g;
const NORMALIZED_TICKER_PATTERN =
  /^(?=.*[A-Z])[A-Z0-9]{1,6}(?:\.[A-Z0-9]{1,4})?$/;
const SYMBOL_STOP_WORDS = new Set([
  'AND',
  'FOR',
  'GIVE',
  'HELP',
  'I',
  'IS',
  'MARKET',
  'OF',
  'PLEASE',
  'PORTFOLIO',
  'PRICE',
  'QUOTE',
  'RISK',
  'SHOW',
  'SYMBOL',
  'THE',
  'TICKER',
  'WHAT',
  'WITH'
]);
const COMPANY_NAME_SYMBOL_ALIASES: Record<string, string> = {
  adobe: 'ADBE',
  'advanced micro devices': 'AMD',
  amd: 'AMD',
  airbnb: 'ABNB',
  alphabet: 'GOOGL',
  amazon: 'AMZN',
  amgen: 'AMGN',
  arm: 'ARM',
  asml: 'ASML',
  apple: 'AAPL',
  'bank of america': 'BAC',
  baidu: 'BIDU',
  bnd: 'BND',
  berkshire: 'BRK.B',
  'berkshire hathaway': 'BRK.B',
  'berkshire class b': 'BRK.B',
  blackrock: 'BLK',
  block: 'SQ',
  boeing: 'BA',
  booking: 'BKNG',
  broadcom: 'AVGO',
  cadence: 'CDNS',
  chevron: 'CVX',
  cisco: 'CSCO',
  citigroup: 'C',
  'coca cola': 'KO',
  coinbase: 'COIN',
  comcast: 'CMCSA',
  conocophillips: 'COP',
  costco: 'COST',
  crowdstrike: 'CRWD',
  delta: 'DAL',
  dia: 'DIA',
  disney: 'DIS',
  'eli lilly': 'LLY',
  exxon: 'XOM',
  'exxon mobil': 'XOM',
  ford: 'F',
  'general electric': 'GE',
  google: 'GOOGL',
  gld: 'GLD',
  'gold etf': 'GLD',
  'goldman sachs': 'GS',
  ibm: 'IBM',
  intel: 'INTC',
  intuit: 'INTU',
  ivv: 'IVV',
  iwm: 'IWM',
  jnj: 'JNJ',
  'johnson and johnson': 'JNJ',
  jpmorgan: 'JPM',
  linde: 'LIN',
  'lockheed martin': 'LMT',
  lowes: 'LOW',
  mastercard: 'MA',
  mcdonalds: 'MCD',
  mckesson: 'MCK',
  merck: 'MRK',
  meta: 'META',
  micron: 'MU',
  microsoft: 'MSFT',
  'morgan stanley': 'MS',
  netflix: 'NFLX',
  nike: 'NKE',
  nvidia: 'NVDA',
  oracle: 'ORCL',
  palantir: 'PLTR',
  paypal: 'PYPL',
  pepsico: 'PEP',
  pfizer: 'PFE',
  'procter and gamble': 'PG',
  qqq: 'QQQ',
  qualcomm: 'QCOM',
  raytheon: 'RTX',
  rivian: 'RIVN',
  's and p 500': 'SPY',
  's&p 500': 'SPY',
  salesforce: 'CRM',
  'schwab dividend': 'SCHD',
  schd: 'SCHD',
  servicenow: 'NOW',
  shopify: 'SHOP',
  's and p etf': 'SPY',
  sofi: 'SOFI',
  soxx: 'SOXX',
  's p 500': 'SPY',
  spotify: 'SPOT',
  spy: 'SPY',
  tesla: 'TSLA',
  'technology select sector': 'XLK',
  't mobile': 'TMUS',
  tmobile: 'TMUS',
  'top 100 nasdaq': 'QQQ',
  'total bond market': 'BND',
  'total stock market': 'VTI',
  'total world stock': 'VT',
  '20 year treasury': 'TLT',
  tlt: 'TLT',
  toyota: 'TM',
  tsmc: 'TSM',
  uber: 'UBER',
  unitedhealth: 'UNH',
  verizon: 'VZ',
  'vanguard s&p 500': 'VOO',
  'vanguard total stock market': 'VTI',
  visa: 'V',
  voo: 'VOO',
  vt: 'VT',
  vti: 'VTI',
  walmart: 'WMT',
  'wells fargo': 'WFC',
  xlk: 'XLK',
  xom: 'XOM'
};
const COMPANY_ALIAS_PATTERNS = Object.entries(COMPANY_NAME_SYMBOL_ALIASES).map(
  ([alias, symbol]) => {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return {
      pattern: new RegExp(`\\b${escapedAlias}\\b`, 'i'),
      symbol
    };
  }
);

const INVESTMENT_INTENT_KEYWORDS = [
  'add',
  'allocat',
  'buy',
  'how do i',
  'invest',
  'next',
  'rebalanc',
  'sell',
  'trim',
  'what can i do',
  'what should i do',
  'where should i'
];

const REBALANCE_KEYWORDS = [
  'rebalanc',
  'reduce',
  'trim',
  'underweight',
  'overweight'
];

const STRESS_TEST_KEYWORDS = ['crash', 'drawdown', 'shock', 'stress'];
const STRESS_TEST_TYPOS = ['strestt', 'stresss', 'stresstest'];

const PORTFOLIO_CONTEXT_KEYWORDS = [
  'account',
  'allocation',
  'balance',
  'concentration',
  'diversif',
  'holding',
  'my',
  'portfolio',
  'position',
  'rebalanc',
  'risk'
];
const DECISION_ANALYSIS_QUERY_PATTERNS = [
  /\b(?:should\s+i(?:\s+(?:buy|sell|hold))?|compare|pros\s+and\s+cons|investment\s+thesis|is\s+.*\s+(?:a\s+)?good\s+investment)\b/,
  /\b(?:where\s+should\s+i\s+invest)\b/
];
const RESEARCH_QUERY_PATTERNS = [
  /\b(?:research|analy[sz]e|analysis|overview|break\s+down|deep\s*dive|tell\s+me\s+about|learn\s+about|more\s+about)\b/
];
const HISTORICAL_PERFORMANCE_QUERY_PATTERNS = [
  /\b(?:historical\s+performance|past\s+performance|price\s+trend)\b/,
  /\b(?:how\s+(?:has|well\s+has).*(?:performed?|doing)|performance\s+over\s+time)\b/
];
const FIRE_QUERY_PATTERNS = [
  /\b(?:financial\s+independence|retire(?:ment|d)?|safe\s+withdrawal|withdrawal\s+rate)\b/,
  /\bfire\s+(?:plan|path|goal|read|readiness|retirement|independence|withdrawal|rate|calculator|projection)\b/i,
  /\b(?:on\s+track\s+for\s+(?:retirement|fire)|when\s+can\s+i\s+retire|am\s+i\s+(?:ready|prepared)\s+for\s+retirement)\b/i,
  /\b(?:retire\s+at\s+(?:the|what)\s+age|when\s+is\s+the\s+right\s+time\s+to\s+retire|getting\s+old|getting\s+older)\b/i
];
const PORTFOLIO_VALUE_CONTEXT_PATTERN =
  /\b(?:i|my|me|portfolio|account|accounts|holdings|invested|investment|total)\b/;
const PORTFOLIO_VALUE_QUESTION_PATTERN =
  /\b(?:how\s*much|what(?:'s| is)|show|tell|do i have|total)\b/;
const PORTFOLIO_VALUE_KEYWORD_PATTERN =
  /\b(?:money|cash|value|worth|balance|net\s+worth|assets|equity)\b/;
const PORTFOLIO_VALUE_QUERY_PATTERNS = [
  /\b(?:net\s+worth|portfolio\s+value|portfolio\s+worth|account\s+balance|total\s+portfolio\s+value)\b/,
  /\bhow\s*much\b.*\b(?:money|cash|value|worth|balance)\b/
];
const PORTFOLIO_SUMMARY_QUERY_PATTERNS = [
  /\b(?:portfolio\s+summary|net\s+worth\s+summary|overall\s+portfolio)\b/,
  /\b(?:summarize|summary)\b.*\b(?:portfolio|account)\b/
];
const CURRENT_HOLDINGS_QUERY_PATTERNS = [
  /\b(?:current\s+holdings|current\s+positions|what\s+do\s+i\s+own)\b/,
  /\b(?:show|list)\b.*\b(?:holdings|positions)\b/
];
const PORTFOLIO_RISK_METRICS_QUERY_PATTERNS = [
  /\b(?:risk\s+metrics|risk\s+summary)\b/,
  /\b(?:sector|geographic|country)\b.*\b(?:breakdown|concentration|risk)\b/
];
const RECENT_TRANSACTIONS_QUERY_PATTERNS = [
  /\b(?:recent\s+transactions|recent\s+trades|recent\s+orders)\b/,
  /\b(?:last\s+time\s+i\s+bought|last\s+time\s+i\s+sold|transaction\s+history|order\s+history)\b/
];
const LIVE_QUOTE_QUERY_PATTERNS = [
  /\b(?:live\s+quote|latest\s+quote|today(?:'s)?\s+price)\b/,
  /\b(?:day\s+change|trading\s+volume)\b/
];
const ASSET_FUNDAMENTALS_QUERY_PATTERNS = [
  /\b(?:fundamentals?|valuation|market\s+cap)\b/,
  /\b(?:pe\s+ratio|p\s*e|dividend\s+yield|52\s*week)\b/
];
const ASSET_FUNDAMENTALS_INTENT_FRAGMENTS = [
  'fundament',
  'valuat',
  'market cap',
  'p e',
  'dividend',
  'earnings',
  'balance sheet',
  'company analysis'
];
const FINANCIAL_NEWS_QUERY_PATTERNS = [
  /\b(?:financial\s+news|market\s+news|news\s+headlines?)\b/,
  /\b(?:why\s+did|what\s+happened\s+to)\b/
];
const REBALANCE_CALCULATOR_QUERY_PATTERNS = [
  /\b(?:calculate\s+rebalance|rebalance\s+plan|target\s+allocation)\b/,
  /\b(?:80\s*20|70\s*30|60\s*40)\b.*\b(?:allocation|portfolio)\b/
];
const MARKET_CONTEXT_QUERY_PATTERNS = [/\b(?:market\s+context)\b/];
const TRADE_IMPACT_QUERY_PATTERNS = [
  /\b(?:simulate\s+trade|trade\s+impact|what\s+if\s+i\s+(?:buy|sell))\b/,
  /\b(?:if\s+i\s+buy|if\s+i\s+sell)\b/
];
const TRANSACTION_CATEGORIZE_QUERY_PATTERNS = [
  /\b(?:categori[sz]e|classify|group)\b.*\b(?:transactions?|trades?|orders?)\b/,
  /\b(?:transaction|trade|order)\s+(?:categor(?:y|ies)|breakdown|patterns?)\b/
];
const TAX_ESTIMATE_QUERY_PATTERNS = [
  /\b(?:tax|taxes|liability|owed|owe)\b.*\b(?:estimate|estimat(?:e|ion)|calculate|calc)\b/,
  /\b(?:estimate|calculat(?:e|ion))\b.*\b(?:tax|liability)\b/
];
const TAX_GENERAL_QUERY_PATTERNS = [
  /\b(?:tax|taxes|taxation|irs)\b.*\b(?:need|know|checklist|info|information|guide|help|this year|year[-\s]?end|what do i|tell me about)\b/i,
  /\b(?:need|know|checklist|info|information|guide|help|this year|year[-\s]?end|what do i|tell me about)\b.*\b(?:tax|taxes)\b/i,
  /\b(?:what do i need|tell me|help me|guide to|explain)\b.*\b(?:tax|taxes|taxation)\b/i
];
const COMPANY_ALIAS_CONTEXT_PATTERNS = [
  /\b(?:about|asset|analy[sz]e|analysis|company|deep\s*dive|earnings?|fundamental|fundamentals|learn|market|news|overview|price|quote|research|stock|ticker|thesis|valuation|portfolio|holding|investment|invest|buy|sell|trade|dividend|rebalance|compare)\b/
];
const COMPLIANCE_CHECK_QUERY_PATTERNS = [
  /\b(?:compliance|regulat(?:ion|ory)|policy)\b.*\b(?:check|review|scan)\b/,
  /\b(?:violations?|warnings?|restricted|rule\s+check)\b/
];
const ACCOUNT_OVERVIEW_QUERY_PATTERNS = [
  /\b(?:account\s+overview|account\s+summary|show\s+accounts?)\b/,
  /\b(?:cash\s+balance|account\s+balances?)\b/
];
const EXCHANGE_RATE_QUERY_PATTERNS = [
  /\b(?:exchange\s+rate|fx\s+rate|currency\s+conversion)\b/,
  /\b(?:convert|conversion)\b.*\b(?:usd|eur|gbp|cad|chf|jpy|aud)\b/,
  /\b[a-z]{3}\s+to\s+[a-z]{3}\b/
];
const PRICE_HISTORY_QUERY_PATTERNS = [
  /\b(?:price\s+history|historical\s+price|price\s+trend)\b/,
  /\b(?:chart|performance)\b.*\b(?:30d|90d|1y|historical)\b/
];
const SYMBOL_LOOKUP_QUERY_PATTERNS = [
  /\b(?:symbol\s+lookup|lookup\s+symbol|find\s+ticker|ticker\s+lookup)\b/,
  /\bwhat\s+is\s+the\s+ticker\s+for\b/
];
const MARKET_BENCHMARKS_QUERY_PATTERNS = [
  /\b(?:benchmark|benchmarks|market\s+benchmark|index\s+benchmark)\b/,
  /\b(?:compare)\b.*\b(?:benchmark|index)\b/
];
const ACTIVITY_HISTORY_QUERY_PATTERNS = [
  /\b(?:activity\s+history|trading\s+activity|order\s+activity)\b/,
  /\b(?:activity)\b.*\b(?:history|summary)\b/
];
const DEMO_DATA_QUERY_PATTERNS = [
  /\b(?:demo\s+data|sample\s+data|mock\s+data|scenario\s+planning)\b/
];
const SEED_FUNDS_QUERY_PATTERNS = [
  /\b(?:seed\s+(?:money|funds|data)|add(?:ing)?\s+test\s+(?:money|funds|data)|quick\s+check|top\s+up|load\s+test\s+money|fund\s+my\s+account)\b/
];
const CREATE_ACCOUNT_QUERY_PATTERNS = [/\b(?:create|open|add)\b.*\baccount\b/];
const CREATE_ORDER_QUERY_PATTERNS = [
  /\b(?:create|place|submit|make|execute|put)\b.*\border\b/i,
  /\b(?:buy|purchase|trade|sell)\b.*\b\d+\s*(?:usd|eur|gbp|cad|chf|jpy|aud|shares?|units?|\$)/i
];
const IDENTITY_PRIVACY_QUERY_PATTERNS = [
  /\b(?:who\s+am\s+i|what\s+is\s+my\s+name|tell\s+me\s+who\s+i\s+am)\b/
];
const ANSWER_NUMERIC_INTENT_KEYWORDS = [
  'allocat',
  'balance',
  'drawdown',
  'hhi',
  'market',
  'money',
  'performance',
  'price',
  'quote',
  'return',
  'risk',
  'shock',
  'stress',
  'trim',
  'worth'
];
const ANSWER_ACTIONABLE_KEYWORDS = [
  'add',
  'allocate',
  'buy',
  'hedge',
  'increase',
  'monitor',
  'rebalance',
  'reduce',
  'sell',
  'trim'
];
const DISALLOWED_RESPONSE_PATTERNS = [
  /\bas an ai\b/i,
  /\bi am not (?:a|your) financial advisor\b/i,
  /\bi can(?:not|'t) provide financial advice\b/i,
  /\bconsult (?:a|your) financial advisor\b/i
];
const MINIMUM_GENERATED_ANSWER_WORDS = 12;

interface AnswerQualitySignals {
  disallowedPhraseDetected: boolean;
  hasActionableGuidance: boolean;
  hasInvestmentIntent: boolean;
  hasNumericIntent: boolean;
  hasNumericSignal: boolean;
  sentenceCount: number;
  wordCount: number;
}

function normalizeIntentQuery(query: string) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAnswerQualitySignals({
  answer,
  query
}: {
  answer: string;
  query: string;
}): AnswerQualitySignals {
  const normalizedAnswer = answer.trim();
  const normalizedAnswerLowerCase = normalizedAnswer.toLowerCase();
  const normalizedQueryLowerCase = query.toLowerCase();
  const words = normalizedAnswer.split(/\s+/).filter(Boolean);
  const sentenceCount = normalizedAnswer
    .split(/[.!?](?:\s+|$)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
  const hasInvestmentIntent = INVESTMENT_INTENT_KEYWORDS.some((keyword) => {
    return normalizedQueryLowerCase.includes(keyword);
  });
  const hasNumericIntent = ANSWER_NUMERIC_INTENT_KEYWORDS.some((keyword) => {
    return normalizedQueryLowerCase.includes(keyword);
  });
  const hasActionableGuidance = ANSWER_ACTIONABLE_KEYWORDS.some((keyword) => {
    return normalizedAnswerLowerCase.includes(keyword);
  });
  const hasNumericSignal = /\d/.test(normalizedAnswer);
  const disallowedPhraseDetected = DISALLOWED_RESPONSE_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedAnswer);
    }
  );

  return {
    disallowedPhraseDetected,
    hasActionableGuidance,
    hasInvestmentIntent,
    hasNumericIntent,
    hasNumericSignal,
    sentenceCount,
    wordCount: words.length
  };
}

export function isGeneratedAnswerReliable({
  answer,
  query
}: {
  answer: string;
  query: string;
}) {
  const qualitySignals = getAnswerQualitySignals({ answer, query });

  if (qualitySignals.disallowedPhraseDetected) {
    return false;
  }

  if (
    (qualitySignals.hasInvestmentIntent || qualitySignals.hasNumericIntent) &&
    qualitySignals.wordCount < MINIMUM_GENERATED_ANSWER_WORDS
  ) {
    return false;
  }

  if (
    qualitySignals.hasInvestmentIntent &&
    !qualitySignals.hasActionableGuidance
  ) {
    return false;
  }

  if (qualitySignals.hasNumericIntent && !qualitySignals.hasNumericSignal) {
    return false;
  }

  return true;
}

export function evaluateAnswerQuality({
  answer,
  query
}: {
  answer: string;
  query: string;
}): AiAgentVerificationCheck {
  const qualitySignals = getAnswerQualitySignals({ answer, query });
  const issues: string[] = [];

  if (qualitySignals.disallowedPhraseDetected) {
    issues.push('Response contains a generic AI disclaimer');
  }

  if (qualitySignals.hasInvestmentIntent || qualitySignals.hasNumericIntent) {
    if (qualitySignals.wordCount < MINIMUM_GENERATED_ANSWER_WORDS) {
      issues.push(
        `Response length is short (${qualitySignals.wordCount} words; target >= ${MINIMUM_GENERATED_ANSWER_WORDS})`
      );
    }

    if (qualitySignals.sentenceCount < 2) {
      issues.push(
        `Response uses limited structure (${qualitySignals.sentenceCount} sentence)`
      );
    }
  }

  if (
    qualitySignals.hasInvestmentIntent &&
    !qualitySignals.hasActionableGuidance
  ) {
    issues.push('Investment request lacks explicit action guidance');
  }

  if (qualitySignals.hasNumericIntent && !qualitySignals.hasNumericSignal) {
    issues.push('Quantitative query response lacks numeric support');
  }

  if (qualitySignals.disallowedPhraseDetected) {
    return {
      check: 'response_quality',
      details: issues.join('; '),
      status: 'failed'
    };
  }

  return {
    check: 'response_quality',
    details:
      issues.length > 0
        ? issues.join('; ')
        : 'Response passed structure, actionability, and evidence heuristics',
    status: issues.length === 0 ? 'passed' : 'warning'
  };
}

function normalizeSymbolCandidate(rawCandidate: string) {
  const hasDollarPrefix = rawCandidate.startsWith('$');
  const candidate = hasDollarPrefix ? rawCandidate.slice(1) : rawCandidate;

  if (!candidate) {
    return null;
  }

  const normalized = candidate.toUpperCase();

  if (SYMBOL_STOP_WORDS.has(normalized)) {
    return null;
  }

  if (!NORMALIZED_TICKER_PATTERN.test(normalized)) {
    return null;
  }

  // Conservative mode for non-prefixed symbols avoids false positives from
  // natural language words such as WHAT/THE/AND.
  if (!hasDollarPrefix && candidate !== candidate.toUpperCase()) {
    return null;
  }

  return normalized;
}

export function extractSymbolsFromQuery(query: string) {
  const normalizedQuery = normalizeIntentQuery(query);
  const hasCompanyAliasContext = COMPANY_ALIAS_CONTEXT_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const matches = query.match(CANDIDATE_TICKER_PATTERN) ?? [];
  const aliasMatches = COMPANY_ALIAS_PATTERNS.filter(({ pattern }) => {
    return pattern.test(query);
  });
  const hasMultipleAliasMatches = aliasMatches.length > 1;

  const aliasSymbols = aliasMatches
    .filter(() => {
      return hasCompanyAliasContext || hasMultipleAliasMatches;
    })
    .map(({ symbol }) => symbol);

  return Array.from(
    new Set([
      ...matches
        .map((candidate: string) => normalizeSymbolCandidate(candidate))
        .filter((val): val is string => val !== null),
      ...aliasSymbols
    ])
  );
}

export function determineToolPlan({
  query,
  symbols
}: {
  query: string;
  symbols?: string[];
}): AiAgentToolName[] {
  const normalizedQuery = normalizeIntentQuery(query);
  const hasIdentityPrivacyIntent = IDENTITY_PRIVACY_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );

  if (hasIdentityPrivacyIntent) {
    return [];
  }

  const selectedTools = new Set<AiAgentToolName>();
  const extractedSymbols = symbols?.length
    ? symbols
    : extractSymbolsFromQuery(query);
  const hasInvestmentIntent = INVESTMENT_INTENT_KEYWORDS.some((keyword) => {
    return normalizedQuery.includes(keyword);
  });
  const hasRebalanceIntent = REBALANCE_KEYWORDS.some((keyword) => {
    return normalizedQuery.includes(keyword);
  });
  const hasStressTestIntent = [...STRESS_TEST_KEYWORDS, ...STRESS_TEST_TYPOS].some(
    (keyword) => {
      return normalizedQuery.includes(keyword);
    }
  );
  const hasPortfolioContextIntent = PORTFOLIO_CONTEXT_KEYWORDS.some(
    (keyword) => {
      return normalizedQuery.includes(keyword);
    }
  );
  const hasDecisionAnalysisIntent = DECISION_ANALYSIS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasResearchIntent = RESEARCH_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasHistoricalPerformanceIntent =
    HISTORICAL_PERFORMANCE_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    });
  const hasFireIntent = FIRE_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasBroadPortfolioValueIntent =
    PORTFOLIO_VALUE_QUESTION_PATTERN.test(normalizedQuery) &&
    PORTFOLIO_VALUE_KEYWORD_PATTERN.test(normalizedQuery) &&
    PORTFOLIO_VALUE_CONTEXT_PATTERN.test(normalizedQuery);
  const hasPortfolioValueIntent =
    PORTFOLIO_VALUE_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    }) || hasBroadPortfolioValueIntent;
  const hasPortfolioSummaryIntent = PORTFOLIO_SUMMARY_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasCurrentHoldingsIntent = CURRENT_HOLDINGS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasPortfolioRiskMetricsIntent =
    PORTFOLIO_RISK_METRICS_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    });
  const hasRecentTransactionsIntent = RECENT_TRANSACTIONS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasLiveQuoteIntent = LIVE_QUOTE_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasAssetFundamentalsIntent =
    ASSET_FUNDAMENTALS_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    }) ||
    ASSET_FUNDAMENTALS_INTENT_FRAGMENTS.some((fragment) => {
      return normalizedQuery.includes(fragment);
    });
  const hasFinancialNewsIntent = FINANCIAL_NEWS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasRebalanceCalculatorIntent = REBALANCE_CALCULATOR_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasTradeImpactIntent = TRADE_IMPACT_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasMarketContextIntent =
    MARKET_CONTEXT_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    }) || normalizedQuery.includes('market context');
  const hasTransactionCategorizationIntent =
    TRANSACTION_CATEGORIZE_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    });
  const hasTaxEstimateIntent = TAX_ESTIMATE_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasGeneralTaxIntent = TAX_GENERAL_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasComplianceCheckIntent = COMPLIANCE_CHECK_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasAccountOverviewIntent = ACCOUNT_OVERVIEW_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasExchangeRateIntent = EXCHANGE_RATE_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasPriceHistoryIntent = PRICE_HISTORY_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasSymbolLookupIntent = SYMBOL_LOOKUP_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasMarketBenchmarksIntent = MARKET_BENCHMARKS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasActivityHistoryIntent = ACTIVITY_HISTORY_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasDemoDataIntent = DEMO_DATA_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasSeedFundsIntent = SEED_FUNDS_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasCreateAccountIntent = CREATE_ACCOUNT_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasCreateOrderIntent = CREATE_ORDER_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasExplicitNonFireSymbol =
    extractedSymbols.some(
      (symbol) => !(hasFireIntent && symbol === 'FIRE')
    ) &&
    extractedSymbols.length > 0;
  const hasTickerDecisionIntent =
    hasExplicitNonFireSymbol && (hasDecisionAnalysisIntent || hasResearchIntent);
  const hasDecisionValuationIntent =
    hasAssetFundamentalsIntent ||
    /\b(?:valuation|metrics?|market\s*cap|p\s*e|earnings|dividend)\b/.test(
      normalizedQuery
    );
  const hasDecisionCatalystIntent =
    hasFinancialNewsIntent ||
    /\b(?:catalyst|catalysts|news)\b/.test(normalizedQuery);
  const hasDirectFinancialNewsIntent = hasFinancialNewsIntent
    ? true
    : /\bnews\b/.test(normalizedQuery) && hasExplicitNonFireSymbol;

  if (hasDirectFinancialNewsIntent) {
    selectedTools.add('get_financial_news');
  }

  if (
    normalizedQuery.includes('portfolio') ||
    normalizedQuery.includes('holding') ||
    normalizedQuery.includes('allocation') ||
    normalizedQuery.includes('performance') ||
    normalizedQuery.includes('return')
  ) {
    selectedTools.add('portfolio_analysis');
  }

  if (hasPortfolioValueIntent) {
    selectedTools.add('portfolio_analysis');
  }

  if (hasPortfolioSummaryIntent) {
    selectedTools.add('get_portfolio_summary');
  }

  if (hasCurrentHoldingsIntent) {
    selectedTools.add('get_current_holdings');
  }

  if (
    normalizedQuery.includes('risk') ||
    normalizedQuery.includes('concentration') ||
    normalizedQuery.includes('diversif')
  ) {
    selectedTools.add('portfolio_analysis');
    selectedTools.add('risk_assessment');
  }

  if (hasPortfolioRiskMetricsIntent) {
    selectedTools.add('get_portfolio_risk_metrics');
  }

  if (hasFireIntent) {
    selectedTools.add('portfolio_analysis');
    selectedTools.add('get_portfolio_summary');
    selectedTools.add('risk_assessment');
    selectedTools.add('stress_test');
    selectedTools.add('fire_analysis');
  }

  if (
    (hasRebalanceIntent ||
      (hasInvestmentIntent &&
        (!hasTickerDecisionIntent || hasPortfolioContextIntent))) &&
    !hasDemoDataIntent &&
    !hasSeedFundsIntent
  ) {
    selectedTools.add('portfolio_analysis');
    selectedTools.add('risk_assessment');
    selectedTools.add('rebalance_plan');
  }

  if (hasRecentTransactionsIntent) {
    selectedTools.add('get_recent_transactions');
  }

  if (hasStressTestIntent) {
    selectedTools.add('portfolio_analysis');
    selectedTools.add('risk_assessment');
    selectedTools.add('stress_test');
  }

  if (hasTickerDecisionIntent) {
    selectedTools.add('get_asset_fundamentals');
    selectedTools.add('get_financial_news');
    selectedTools.add('price_history');

    if (hasDecisionValuationIntent && hasDecisionCatalystIntent) {
      selectedTools.add('market_data_lookup');
    }

    if (hasMarketContextIntent && hasExplicitNonFireSymbol) {
      selectedTools.add('market_data_lookup');
    }
  }

  if (hasHistoricalPerformanceIntent && hasExplicitNonFireSymbol) {
    selectedTools.add('price_history');
  }

  const hasGenericMarketLookupIntent =
    normalizedQuery.includes('quote') ||
    normalizedQuery.includes('price') ||
    normalizedQuery.includes('ticker') ||
    (!hasSymbolLookupIntent &&
      hasExplicitNonFireSymbol &&
      !hasTickerDecisionIntent &&
      !hasDirectFinancialNewsIntent);
  const hasMarketTierCandidate =
    hasSymbolLookupIntent ||
    hasPriceHistoryIntent ||
    hasHistoricalPerformanceIntent ||
    hasAssetFundamentalsIntent ||
    hasFinancialNewsIntent ||
    hasLiveQuoteIntent ||
    hasGenericMarketLookupIntent ||
    hasMarketContextIntent;

  if (hasMarketTierCandidate && !hasFireIntent && !hasSeedFundsIntent) {
    if (hasSymbolLookupIntent) {
      selectedTools.add('symbol_lookup');
    } else if (hasPriceHistoryIntent || hasHistoricalPerformanceIntent) {
      selectedTools.add('price_history');
    } else if (hasAssetFundamentalsIntent) {
      selectedTools.add('get_asset_fundamentals');
    } else if (hasFinancialNewsIntent) {
      selectedTools.add('get_financial_news');
    } else if (hasLiveQuoteIntent) {
      selectedTools.add('get_live_quote');
    } else if (hasMarketContextIntent && hasExplicitNonFireSymbol) {
      selectedTools.add('market_data_lookup');
    } else if (hasGenericMarketLookupIntent) {
      selectedTools.add('market_data_lookup');
    }
  }

  if (
    hasMarketContextIntent &&
    hasExplicitNonFireSymbol &&
    !hasFireIntent &&
    !hasSeedFundsIntent &&
    !selectedTools.has('market_data_lookup')
  ) {
    selectedTools.add('market_data_lookup');
  }

  if (hasRebalanceCalculatorIntent) {
    selectedTools.add('calculate_rebalance_plan');
  }

  if (hasTradeImpactIntent) {
    selectedTools.add('portfolio_analysis');
    selectedTools.add('risk_assessment');
    selectedTools.add('rebalance_plan');
    selectedTools.add('simulate_trade_impact');
  }

  if (hasTransactionCategorizationIntent) {
    selectedTools.add('transaction_categorize');
  }

  if (hasTaxEstimateIntent || hasGeneralTaxIntent) {
    selectedTools.add('tax_estimate');
  }

  if (hasComplianceCheckIntent) {
    selectedTools.add('compliance_check');
  }

  if (hasAccountOverviewIntent) {
    selectedTools.add('account_overview');
  }

  if (hasExchangeRateIntent) {
    selectedTools.add('exchange_rate');
  }

  if (hasMarketBenchmarksIntent) {
    selectedTools.add('market_benchmarks');
  }

  if (hasActivityHistoryIntent) {
    selectedTools.add('activity_history');
  }

  if (hasDemoDataIntent) {
    selectedTools.add('demo_data');
  }

  if (hasSeedFundsIntent) {
    selectedTools.add('seed_funds');
  }

  if (hasCreateAccountIntent) {
    selectedTools.add('create_account');
  }

  if (hasCreateOrderIntent) {
    selectedTools.add('create_order');
  }

  return Array.from(selectedTools);
}

export function calculateConfidence({
  toolCalls,
  verification
}: {
  toolCalls: AiAgentToolCall[];
  verification: AiAgentVerificationCheck[];
}): AiAgentConfidence {
  const successfulToolCalls = toolCalls.filter(({ status }) => {
    return status === 'success';
  }).length;

  const passedVerification = verification.filter(({ status }) => {
    return status === 'passed';
  }).length;

  const failedVerification = verification.filter(({ status }) => {
    return status === 'failed';
  }).length;

  const toolSuccessRate =
    toolCalls.length > 0 ? successfulToolCalls / toolCalls.length : 0;
  const verificationPassRate =
    verification.length > 0 ? passedVerification / verification.length : 0;

  let score =
    toolCalls.length === 0
      ? 0.2 + verificationPassRate * 0.3
      : 0.4 + toolSuccessRate * 0.35 + verificationPassRate * 0.25;
  score -= failedVerification * 0.1;
  score = Math.max(0, Math.min(1, score));

  let band: AiAgentConfidence['band'] = 'low';

  if (score >= 0.8) {
    band = 'high';
  } else if (score >= 0.6) {
    band = 'medium';
  }

  return {
    band,
    score: Number(score.toFixed(2))
  };
}
