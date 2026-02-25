import {
  AiAgentConfidence,
  AiAgentToolCall,
  AiAgentToolName,
  AiAgentVerificationCheck
} from './ai-agent.interfaces';

const CANDIDATE_TICKER_PATTERN = /\$?[A-Za-z0-9.]{1,10}/g;
const NORMALIZED_TICKER_PATTERN = /^(?=.*[A-Z])[A-Z0-9]{1,6}(?:\.[A-Z0-9]{1,4})?$/;
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
const SYMBOL_TO_COMPANY_ALIASES = Object.entries(COMPANY_NAME_SYMBOL_ALIASES).reduce(
  (result, [alias, symbol]) => {
    if (!result[symbol]) {
      result[symbol] = [];
    }

    result[symbol].push(alias);

    return result;
  },
  {} as Record<string, string[]>
);
const KNOWN_TICKER_SYMBOLS = new Set(
  Object.values(COMPANY_NAME_SYMBOL_ALIASES).map((symbol) => {
    return symbol.toUpperCase();
  })
);
const KNOWN_SINGLE_WORD_COMPANY_ALIASES = Object.keys(
  COMPANY_NAME_SYMBOL_ALIASES
).filter((alias) => {
  return /^[a-z][a-z0-9.-]{2,}$/.test(alias) && !alias.includes(' ');
});
const TOKEN_QUERY_PATTERN = /[A-Za-z0-9.]{2,12}/g;

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
const NEWS_EXPANSION_QUERY_PATTERNS = [
  /\b(?:more\s+about|tell\s+me\s+more\s+about|expand\s+on|details?\s+on|read\s+more\s+about)\b/,
  /\b(?:this|that|first|second|third)\s+(?:headline|article|story)\b/,
  /\bheadline\s*(?:#|number\s*)?\d+\b/
];
const REBALANCE_CALCULATOR_QUERY_PATTERNS = [
  /\b(?:calculate\s+rebalance|rebalance\s+plan|target\s+allocation)\b/,
  /\b(?:80\s*20|70\s*30|60\s*40)\b.*\b(?:allocation|portfolio)\b/
];
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
const COMPANY_ALIAS_CONTEXT_PATTERNS = [
  /\b(?:asset|company|earnings?|fundamental|fundamentals|market|news|price|quote|stock|ticker|valuation|portfolio|holding|investment|invest|buy|sell|trade|dividend|rebalance|compare)\b/
];
const COMPLIANCE_CHECK_QUERY_PATTERNS = [
  /\b(?:compliance|regulat(?:ion|ory)|policy)\b.*\b(?:check|review|scan)\b/,
  /\b(?:violations?|warnings?|restricted|rule\s+check)\b/
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

function levenshteinDistance(a: string, b: string) {
  if (a === b) {
    return 0;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => {
    return Array(cols).fill(0);
  });

  for (let row = 0; row < rows; row++) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col++) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const substitutionCost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function normalizeSymbolForDistance(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      return `${part[0].toUpperCase()}${part.slice(1)}`;
    })
    .join(' ');
}

function getPrimaryCompanyNameForSymbol(symbol: string) {
  const aliases = SYMBOL_TO_COMPANY_ALIASES[symbol] ?? [];
  const preferredAlias = aliases.find((alias) => {
    return /^[a-z][a-z]+(?:\s+[a-z][a-z]+)*$/.test(alias);
  });

  if (preferredAlias) {
    return toTitleCase(preferredAlias);
  }

  return symbol;
}

export interface TickerClarificationSuggestion {
  companyName: string;
  input: string;
  symbol: string;
}

function findClosestSymbolCandidate(input: string) {
  const normalizedInput = normalizeSymbolForDistance(input);

  if (!normalizedInput || KNOWN_TICKER_SYMBOLS.has(input.toUpperCase())) {
    return undefined;
  }

  let bestMatch: { distance: number; symbol: string } | undefined;

  for (const candidateSymbol of KNOWN_TICKER_SYMBOLS) {
    const normalizedCandidate = normalizeSymbolForDistance(candidateSymbol);

    if (!normalizedCandidate) {
      continue;
    }

    const distance = levenshteinDistance(normalizedInput, normalizedCandidate);

    if (
      !bestMatch ||
      distance < bestMatch.distance ||
      (distance === bestMatch.distance && candidateSymbol < bestMatch.symbol)
    ) {
      bestMatch = {
        distance,
        symbol: candidateSymbol
      };
    }
  }

  if (!bestMatch) {
    return undefined;
  }

  const maxDistance = normalizedInput.length <= 4 ? 1 : 2;

  return bestMatch.distance <= maxDistance ? bestMatch.symbol : undefined;
}

function findClosestCompanyAliasCandidate(input: string) {
  const normalizedInput = input.toLowerCase();

  if (
    normalizedInput.length < 4 ||
    COMPANY_NAME_SYMBOL_ALIASES[normalizedInput] !== undefined
  ) {
    return undefined;
  }

  let bestMatch: { alias: string; distance: number } | undefined;

  for (const alias of KNOWN_SINGLE_WORD_COMPANY_ALIASES) {
    if (alias[0] !== normalizedInput[0]) {
      continue;
    }

    if (Math.abs(alias.length - normalizedInput.length) > 2) {
      continue;
    }

    const distance = levenshteinDistance(normalizedInput, alias);

    if (
      !bestMatch ||
      distance < bestMatch.distance ||
      (distance === bestMatch.distance && alias < bestMatch.alias)
    ) {
      bestMatch = {
        alias,
        distance
      };
    }
  }

  if (!bestMatch) {
    return undefined;
  }

  const maxDistance = 2;

  return bestMatch.distance <= maxDistance
    ? COMPANY_NAME_SYMBOL_ALIASES[bestMatch.alias]
    : undefined;
}

export function getTickerClarificationSuggestion({
  query,
  unresolvedSymbols = []
}: {
  query: string;
  unresolvedSymbols?: string[];
}): TickerClarificationSuggestion | undefined {
  const hasTickerIntent =
    /\b(?:asset|company|equity|fundamental|news|price|quote|shares?|stock|symbol|ticker|valuation)\b/i.test(
      query
    );

  if (unresolvedSymbols.length === 0 && !hasTickerIntent) {
    return undefined;
  }

  const normalizedQuery = normalizeIntentQuery(query);
  const rawTokens = query.match(TOKEN_QUERY_PATTERN) ?? [];
  const queryTokens = (normalizedQuery.match(TOKEN_QUERY_PATTERN) ?? []).filter(
    (token) => {
      return !SYMBOL_STOP_WORDS.has(token.toUpperCase());
    }
  );
  const hasExactKnownSymbolToken = queryTokens.some((token) => {
    return KNOWN_TICKER_SYMBOLS.has(token.toUpperCase());
  });
  const hasExactKnownCompanyAlias = queryTokens.some((token) => {
    return COMPANY_NAME_SYMBOL_ALIASES[token.toLowerCase()] !== undefined;
  });

  if (
    unresolvedSymbols.length === 0 &&
    (hasExactKnownSymbolToken || hasExactKnownCompanyAlias)
  ) {
    return undefined;
  }

  const explicitTickerCandidates = rawTokens
    .map((token) => token.replace(/^\$/, ''))
    .filter((token) => {
      return /^[A-Z0-9.]{2,12}$/.test(token);
    })
    .map((token) => token.toUpperCase());
  const symbolCandidates = [
    ...unresolvedSymbols.map((symbol) => symbol.toUpperCase()),
    ...explicitTickerCandidates
  ];

  for (const candidate of symbolCandidates) {
    const suggestedSymbol = findClosestSymbolCandidate(candidate);

    if (suggestedSymbol) {
      return {
        companyName: getPrimaryCompanyNameForSymbol(suggestedSymbol),
        input: candidate,
        symbol: suggestedSymbol
      };
    }
  }

  for (const token of queryTokens) {
    const suggestedSymbol = findClosestCompanyAliasCandidate(token);

    if (suggestedSymbol) {
      return {
        companyName: getPrimaryCompanyNameForSymbol(suggestedSymbol),
        input: token,
        symbol: suggestedSymbol
      };
    }
  }

  return undefined;
}

export function formatTickerClarificationSuggestion(
  suggestion: TickerClarificationSuggestion
) {
  return `I could not confidently resolve "${suggestion.input}". Did you mean ${suggestion.companyName} (${suggestion.symbol})?`;
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
  const disallowedPhraseDetected = DISALLOWED_RESPONSE_PATTERNS.some((pattern) => {
    return pattern.test(normalizedAnswer);
  });

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

  if (qualitySignals.wordCount < MINIMUM_GENERATED_ANSWER_WORDS) {
    return false;
  }

  if (qualitySignals.hasInvestmentIntent && !qualitySignals.hasActionableGuidance) {
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

  if (qualitySignals.hasInvestmentIntent && !qualitySignals.hasActionableGuidance) {
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
  const candidate = hasDollarPrefix
    ? rawCandidate.slice(1)
    : rawCandidate;

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
  const hasCompanyAliasContext = COMPANY_ALIAS_CONTEXT_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
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
    new Set(
      [
        ...matches
          .map((candidate) => normalizeSymbolCandidate(candidate))
          .filter(Boolean),
        ...aliasSymbols
      ]
    )
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
  const hasStressTestIntent = STRESS_TEST_KEYWORDS.some((keyword) => {
    return normalizedQuery.includes(keyword);
  });
  const hasBroadPortfolioValueIntent =
    PORTFOLIO_VALUE_QUESTION_PATTERN.test(normalizedQuery) &&
    PORTFOLIO_VALUE_KEYWORD_PATTERN.test(normalizedQuery) &&
    PORTFOLIO_VALUE_CONTEXT_PATTERN.test(normalizedQuery);
  const hasPortfolioValueIntent = PORTFOLIO_VALUE_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  ) || hasBroadPortfolioValueIntent;
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
  const hasPortfolioRiskMetricsIntent = PORTFOLIO_RISK_METRICS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasRecentTransactionsIntent = RECENT_TRANSACTIONS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasLiveQuoteIntent = LIVE_QUOTE_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasAssetFundamentalsIntent = ASSET_FUNDAMENTALS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  ) ||
  ASSET_FUNDAMENTALS_INTENT_FRAGMENTS.some((fragment) => {
    return normalizedQuery.includes(fragment);
  });
  const hasFinancialNewsIntent = FINANCIAL_NEWS_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );
  const hasNewsExpansionIntent = NEWS_EXPANSION_QUERY_PATTERNS.some(
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
  const hasTransactionCategorizationIntent =
    TRANSACTION_CATEGORIZE_QUERY_PATTERNS.some((pattern) => {
      return pattern.test(normalizedQuery);
    });
  const hasTaxEstimateIntent = TAX_ESTIMATE_QUERY_PATTERNS.some((pattern) => {
    return pattern.test(normalizedQuery);
  });
  const hasComplianceCheckIntent = COMPLIANCE_CHECK_QUERY_PATTERNS.some(
    (pattern) => {
      return pattern.test(normalizedQuery);
    }
  );

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

  if (hasInvestmentIntent || hasRebalanceIntent) {
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

  if (
    normalizedQuery.includes('quote') ||
    normalizedQuery.includes('price') ||
    normalizedQuery.includes('market') ||
    normalizedQuery.includes('ticker') ||
    extractedSymbols.length > 0
  ) {
    selectedTools.add('market_data_lookup');
  }

  if (hasLiveQuoteIntent) {
    selectedTools.add('get_live_quote');
  }

  if (hasAssetFundamentalsIntent) {
    selectedTools.add('get_asset_fundamentals');
  }

  if (hasFinancialNewsIntent) {
    selectedTools.add('get_financial_news');
  }

  if (hasNewsExpansionIntent) {
    selectedTools.add('get_article_content');
  }

  if (hasRebalanceCalculatorIntent) {
    selectedTools.add('calculate_rebalance_plan');
  }

  if (hasTradeImpactIntent) {
    selectedTools.add('simulate_trade_impact');
  }

  if (hasTransactionCategorizationIntent) {
    selectedTools.add('transaction_categorize');
  }

  if (hasTaxEstimateIntent) {
    selectedTools.add('tax_estimate');
  }

  if (hasComplianceCheckIntent) {
    selectedTools.add('compliance_check');
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

  let score = 0.4 + toolSuccessRate * 0.35 + verificationPassRate * 0.25;
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
