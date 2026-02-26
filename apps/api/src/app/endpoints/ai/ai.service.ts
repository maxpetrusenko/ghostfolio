import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { BenchmarkService } from '@ghostfolio/api/services/benchmark/benchmark.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import {
  PROPERTY_API_KEY_OPENROUTER,
  PROPERTY_OPENROUTER_MODEL
} from '@ghostfolio/common/config';
import { Filter } from '@ghostfolio/common/interfaces';
import type { AiPromptMode } from '@ghostfolio/common/types';

import { RunnableLambda } from '@langchain/core/runnables';
import { Injectable } from '@nestjs/common';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { DataSource, Type } from '@prisma/client';
import type { SymbolProfile } from '@prisma/client';
import { generateText } from 'ai';
import { createHash, randomUUID } from 'node:crypto';

import {
  AI_AGENT_MEMORY_MAX_TURNS,
  buildAnswer,
  createPreferenceSummaryResponse,
  getMemory,
  getUserPreferences,
  isRecommendationIntentQuery,
  isPreferenceRecallQuery,
  resolvePreferenceUpdate,
  resolveSymbols,
  runMarketDataLookup,
  runPortfolioAnalysis,
  runRiskAssessment,
  setMemory,
  setUserPreferences
} from './ai-agent.chat.helpers';
import { PortfolioAnalysisResult } from './ai-agent.chat.interfaces';
import {
  AiAgentChatResponse,
  AiAgentChatRequest,
  AiAgentToolName,
  AiAgentCitation,
  AiAgentToolCall,
  AgentKernel
} from './ai-agent.interfaces';
import {
  applyToolExecutionPolicy,
  resolveFollowUpSignal,
  createPolicyRouteResponse,
  formatPolicyVerificationDetails,
  AiAgentFollowUpResolverPreviousTurn
} from './ai-agent.policy.utils';
import { createHoldingsPrompt } from './ai-agent.prompt.helpers';
import { runRebalancePlan, runStressTest } from './ai-agent.scenario.helpers';
import {
  calculateConfidence,
  determineToolPlan,
  evaluateAnswerQuality,
  extractSymbolsFromQuery
} from './ai-agent.utils';
import { addVerificationChecks } from './ai-agent.verification.helpers';
import { AiAgentWebSearchService } from './ai-agent.web-search';
import { searchWebNewsForSymbols } from './ai-agent.web-search.helpers';
import {
  generateTextWithMinimax,
  generateTextWithOpenAI,
  generateTextWithZAiGlm
} from './ai-llm.providers';
import { AiObservabilityService } from './ai-observability.service';

const PORTFOLIO_CONTEXT_SYMBOL_TOOLS = new Set([
  'price_history',
  'calculate_rebalance_plan',
  'get_asset_fundamentals',
  'get_current_holdings',
  'get_portfolio_risk_metrics',
  'get_portfolio_summary',
  'portfolio_analysis',
  'rebalance_plan',
  'risk_assessment',
  'simulate_trade_impact',
  'stress_test'
]);
const PORTFOLIO_SYMBOL_CONTEXT_QUERY_PATTERN =
  /\b(?:my|portfolio|holdings?|allocation|account|risk|concentration|rebalance)\b/i;
const FOLLOW_UP_FRESHNESS_PATTERN =
  /\b(?:now|today|latest|current|updated|update)\b/i;
const FOLLOW_UP_FRESHNESS_TOOLS = new Set<AiAgentToolName>([
  'get_financial_news',
  'get_live_quote',
  'market_data_lookup',
  'price_history'
]);
const ORDER_TOOL_TAKE_BY_NAME: Partial<Record<AiAgentToolName, number>> = {
  activity_history: 20,
  get_recent_transactions: 5,
  transaction_categorize: 50,
  compliance_check: 100
};
const AI_TOOL_REGISTRY_MAX_CALLS_PER_REQUEST = 8;
const AI_TOOL_REGISTRY_DEFAULT_MAX_CALLS_PER_TOOL = 1;
const AI_PORTFOLIO_ANALYSIS_CACHE_TTL_IN_MS = 30_000;
const AI_PORTFOLIO_ANALYSIS_CACHE_MAX_AGE_IN_MS = 120_000;
const AI_RESPONSE_CACHE_TTL_IN_MS = 300_000;
const AI_CACHE_BYPASS_PATTERN = /\b(?:now|today|latest|current|updated|update|refresh|real-time)\b/i;
const CONVERSATIONAL_ACKNOWLEDGMENT_QUERY_PATTERN =
  /^\s*(?:oh\s+wow|wow|whoa|cool|nice|awesome|great|got it|ok(?:ay)?|interesting|alright)\b(?:.{0,30})?\s*[!.?]*\s*$/i;
const FINANCE_TOKEN_QUERY_PATTERN =
  /\b(?:portfolio|allocation|holding|holdings|risk|tax|fire|quote|news|symbol|stock|etf|account|order|cash|transaction|market|price)\b/i;
const PORTFOLIO_STATE_SENSITIVE_TOOLS = new Set<AiAgentToolName>([
  'portfolio_analysis',
  'risk_assessment',
  'rebalance_plan',
  'stress_test',
  'fire_analysis',
  'account_overview',
  'get_portfolio_summary',
  'get_current_holdings',
  'get_portfolio_risk_metrics',
  'calculate_rebalance_plan',
  'simulate_trade_impact',
  'activity_history'
]);

interface CachedPortfolioAnalysisPayload {
  data: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
  updatedAt: string;
}
interface CachedResponsePayload {
  answer: string;
}
interface RebalancePlanSimulationSummary {
  afterTopAllocation: number;
  afterTopSymbol: string;
  beforeTopAllocation: number;
  beforeTopSymbol: string;
  beforeHhi: number;
  afterHhi: number;
  driftImprovement: number;
  tradeSummary: string;
}

function buildPortfolioStateVersion(
  holdings: Record<
    string,
    {
      allocationInPercentage?: number;
      dataSource?: string;
      symbol?: string;
      valueInBaseCurrency?: number;
    }
  >
) {
  const normalizedEntries = Object.values(holdings ?? {})
    .map((holding) => {
      const symbol = holding.symbol ?? 'UNKNOWN';
      const dataSource = holding.dataSource ?? 'UNKNOWN';
      const allocation = Number.isFinite(holding.allocationInPercentage)
        ? Number(holding.allocationInPercentage)
        : 0;
      const value = Number.isFinite(holding.valueInBaseCurrency)
        ? Number(holding.valueInBaseCurrency)
        : 0;

      return `${symbol}:${dataSource}:${value.toFixed(4)}:${allocation.toFixed(6)}`;
    })
    .sort();

  if (normalizedEntries.length === 0) {
    return 'empty';
  }

  return createHash('sha256')
    .update(normalizedEntries.join('|'))
    .digest('hex')
    .slice(0, 16);
}

function classifyGoalType(query: string) {
  const normalizedQuery = query.toLowerCase();

  if (/\b(?:why|explain|how come|what changed)\b/.test(normalizedQuery)) {
    return 'explain' as const;
  }

  if (
    /\b(?:buy|sell|place|order|invest|allocate|rebalance|trim|add funds)\b/.test(
      normalizedQuery
    )
  ) {
    return 'act' as const;
  }

  if (/\b(?:compare|vs\.?|versus)\b/.test(normalizedQuery)) {
    return 'compare' as const;
  }

  if (
    /\b(?:quote|price|news|headline|fundamental|ticker|symbol)\b/.test(
      normalizedQuery
    )
  ) {
    return 'lookup' as const;
  }

  if (
    /\b(?:portfolio|allocation|risk|concentration|tax|fire|performance)\b/.test(
      normalizedQuery
    )
  ) {
    return 'analyze' as const;
  }

  return 'unknown' as const;
}

function classifyPrimaryScope(query: string) {
  const normalizedQuery = query.toLowerCase();

  if (/\bfire\b/.test(normalizedQuery)) {
    return 'fire' as const;
  }

  if (/\b(?:tax|gains?|withholding|deduction)\b/.test(normalizedQuery)) {
    return 'tax' as const;
  }

  if (/\b(?:quote|price|news|headline|market)\b/.test(normalizedQuery)) {
    return 'market' as const;
  }

  if (
    /\b(?:symbol|ticker|fundamental|earnings|valuation|company)\b/.test(
      normalizedQuery
    )
  ) {
    return 'symbol' as const;
  }

  if (
    /\b(?:portfolio|allocation|holding|holdings|risk|concentration|account)\b/.test(
      normalizedQuery
    )
  ) {
    return 'portfolio' as const;
  }

  return 'unknown' as const;
}

function buildTurnContext({
  query,
  toolCalls
}: {
  query: string;
  toolCalls: AiAgentToolCall[];
}) {
  const extractedSymbols = extractSymbolsFromQuery(query);
  const lowerCaseSymbols = extractedSymbols.map((symbol) => {
    return symbol.toLowerCase();
  });
  const successfulTools = toolCalls
    .filter(({ status }) => {
      return status === 'success';
    })
    .map(({ tool }) => tool)
    .sort();

  return {
    entities: Array.from(new Set(lowerCaseSymbols)).slice(0, 8),
    goalType: classifyGoalType(query),
    primaryScope: classifyPrimaryScope(query),
    toolSummaryHash:
      successfulTools.length > 0
        ? createHash('sha1').update(successfulTools.join('|')).digest('hex').slice(0, 12)
        : undefined
  };
}

function isArithmeticLikeQuery(query: string) {
  const normalized = query.trim().toLowerCase();

  return (
    /^[\d+\-*/().\s=]+$/.test(normalized) ||
    /\b(?:plus|minus|times|divided by|what is|calculate|compute)\b/.test(
      normalized
    )
  );
}

function isConversationalAcknowledgmentQuery(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!CONVERSATIONAL_ACKNOWLEDGMENT_QUERY_PATTERN.test(normalizedQuery)) {
    return false;
  }

  const hasFinanceToken = FINANCE_TOKEN_QUERY_PATTERN.test(normalizedQuery);
  const hasResolvedSymbol = extractSymbolsFromQuery(query).length > 0;

  return !hasFinanceToken && !hasResolvedSymbol;
}

function shouldUseLlmClarifyFallback({
  followUpSignal,
  policyDecision,
  previousTurn,
  query
}: {
  followUpSignal: {
    isLikelyFollowUp: boolean;
  };
  policyDecision: {
    blockReason: string;
    route: string;
    toolsToExecute: AiAgentToolName[];
  };
  previousTurn?: {
    query: string;
  };
  query: string;
}) {
  if (policyDecision.route !== 'clarify') {
    return false;
  }

  if (policyDecision.toolsToExecute.length > 0) {
    return false;
  }

  if (policyDecision.blockReason !== 'unknown') {
    return false;
  }

  const queryTokenCount = query
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const hasAmbiguousShortInput = queryTokenCount <= 8;

  return followUpSignal.isLikelyFollowUp && hasAmbiguousShortInput && !!previousTurn;
}

function isShortContextFollowUpQuery(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTokens = normalizedQuery
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (normalizedTokens.length === 0 || normalizedTokens.length > 4) {
    return false;
  }

  const followUpPhrases = new Set([
    'why',
    'why not',
    'how so',
    'what do you mean',
    'explain',
    'explain why',
    'anything else',
    'what else',
    'else'
  ]);

  if (followUpPhrases.has(normalizedTokens.join(' '))) {
    return true;
  }

  const hasFollowUpSignal = normalizedTokens.some((token) => {
    return ['why', 'how', 'what', 'mean', 'explain', 'that', 'this', 'it'].includes(token);
  });
  const hasConcreteTopic = normalizedTokens.some((token) => {
    return [
      'portfolio',
      'allocation',
      'holding',
      'holdings',
      'risk',
      'tax',
      'fire',
      'quote',
      'news',
      'symbol',
      'stock',
      'etf',
      'account',
      'order'
    ].includes(token);
  });

  return hasFollowUpSignal && !hasConcreteTopic;
}

function isClearlyNewRequestQuery(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const hasActionVerb =
    /\b(?:analyze|show|check|estimate|calculate|summarize|review|compare|rebalance|buy|sell|invest|create|run|get|fetch)\b/.test(
      normalizedQuery
    );
  const hasFinanceObject =
    /\b(?:portfolio|allocation|holding|holdings|risk|tax|fire|quote|news|fundamentals|price|order|etf|stock|bond|symbol|account|cash|transaction|transactions)\b/.test(
      normalizedQuery
    );

  return hasActionVerb && hasFinanceObject;
}

function isDomainRefusalAnswer(answer: string) {
  const normalizedAnswer = answer.trim().toLowerCase();
  const hasRefusalVerb = /\b(?:cannot|can't|unable|do not|don't)\b/.test(
    normalizedAnswer
  );
  const hasMedicalTopic =
    /\b(?:medical|health|symptom|diagnos|treatment|doctor|medicine)\b/.test(
      normalizedAnswer
    );
  const hasFinanceScope =
    /\b(?:finance|portfolio|tax|market|fire|invest)\b/.test(normalizedAnswer);
  const hasScopeLimiter = /\b(?:only|limited|scope)\b/.test(normalizedAnswer);

  return (
    (hasRefusalVerb && hasMedicalTopic) ||
    (hasRefusalVerb && hasFinanceScope && hasScopeLimiter)
  );
}

function isCapabilityOverviewAnswer(answer: string) {
  const normalizedAnswer = answer.trim().toLowerCase();

  return (
    normalizedAnswer.includes('i am ghostfolio ai') ||
    normalizedAnswer.includes('how can i help with your finances today') ||
    normalizedAnswer.includes('i can assist with:') ||
    normalizedAnswer.includes('try one of these:')
  );
}

function resolveHistoryFollowUpResponse({
  previousTurn,
  query
}: {
  previousTurn?: {
    answer: string;
  };
  query: string;
}) {
  if (!previousTurn) {
    return undefined;
  }

  if (isClearlyNewRequestQuery(query)) {
    return undefined;
  }

  if (!isShortContextFollowUpQuery(query)) {
    return undefined;
  }

  const previousAnswer = previousTurn.answer.trim();

  if (
    /^(?:anything else|what else|else)\s*[?.!]*\s*$/i.test(query) &&
    isCapabilityOverviewAnswer(previousAnswer)
  ) {
    return [
      'Yes. I can continue with your current chat context.',
      'Pick one and I will run it now:',
      '- "Analyze my portfolio allocation and concentration"',
      '- "Get latest quote and fundamentals for NVDA"',
      '- "Estimate tax impact for 5000 USD realized gains"',
      '- "Run a FIRE scenario with 15% higher savings"'
    ].join('\n');
  }

  if (isDomainRefusalAnswer(previousAnswer)) {
    return 'I am limited to finance in Ghostfolio, so I cannot provide medical guidance.';
  }

  if (
    /insufficient confidence to provide a reliable answer from this query alone/i.test(
      previousAnswer
    ) ||
    /insufficient confidence to proceed safely/i.test(previousAnswer)
  ) {
    return 'Your previous message was too ambiguous for a safe answer. Tell me exactly what you want explained and I can continue.';
  }

  return undefined;
}

function buildFireAnalysisAnswer({
  annualWithdrawal,
  holdingsCount,
  hhi,
  topAllocation,
  topSymbol,
  totalValueInBaseCurrency,
  userCurrency
}: {
  annualWithdrawal: number;
  holdingsCount: number;
  hhi: number;
  topAllocation: number;
  topSymbol: string;
  totalValueInBaseCurrency: number;
  userCurrency: string;
}) {
  const monthlyWithdrawal = annualWithdrawal / 12;
  const concentrationBand =
    topAllocation >= 65
      ? 'high concentration'
      : topAllocation >= 40
        ? 'moderate concentration'
        : 'diversified concentration';
  const hhiBand =
    hhi >= 0.5 ? 'high concentration risk' : hhi >= 0.25 ? 'moderate concentration risk' : 'lower concentration risk';

  return [
    `FIRE quick check (rule-of-thumb):`,
    `Portfolio value: ${totalValueInBaseCurrency.toFixed(2)} ${userCurrency} across ${holdingsCount} holdings.`,
    `4% withdrawal estimate: ${annualWithdrawal.toFixed(2)} ${userCurrency}/year (~${monthlyWithdrawal.toFixed(2)} ${userCurrency}/month).`,
    `Diversification: top holding ${topSymbol} at ${topAllocation.toFixed(2)}% (${concentrationBand}); HHI ${hhi.toFixed(3)} (${hhiBand}).`,
    `How to read this: the 4% line is a planning baseline, not a guarantee.`,
    `Next steps: define your target annual spending, compare it to the withdrawal estimate, and reduce single-position concentration before relying on FIRE projections.`
  ].join('\n');
}

function buildNewsBriefFromSummary(financialNewsSummary?: string) {
  const coverage = (financialNewsSummary ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\([A-Z0-9]{1,6}(?:\.[A-Z0-9]{1,4})?\)/.test(line))
    .slice(0, 2);
  const headlines = (financialNewsSummary ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .slice(0, 5);

  if (headlines.length === 0) {
    return financialNewsSummary;
  }

  return [
    'News brief:',
    ...(coverage.length > 0 ? [`Coverage: ${coverage.join(', ')}.`] : []),
    ...headlines,
    'Watch next: earnings guidance, estimate revisions, and valuation sensitivity.'
  ].join('\n');
}

function buildMarketSnapshotAnswer({
  marketData,
  userCurrency
}: {
  marketData?: Awaited<ReturnType<typeof runMarketDataLookup>>;
  userCurrency: string;
}) {
  const quotes = marketData?.quotes ?? [];

  if (quotes.length === 0) {
    return undefined;
  }

  const lines = quotes.slice(0, 5).map(({ currency, marketPrice, symbol }) => {
    return `- ${symbol}: ${marketPrice.toFixed(2)} ${currency}`;
  });

  return [
    'Market snapshot:',
    ...lines,
    `Use these prices as a point-in-time reference (${userCurrency} base context).`
  ].join('\n');
}

function buildPortfolioSnapshotAnswer({
  portfolioAnalysis,
  userCurrency
}: {
  portfolioAnalysis?: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
  userCurrency: string;
}) {
  if (!portfolioAnalysis) {
    return undefined;
  }

  const top = portfolioAnalysis.holdings
    .slice(0, 3)
    .map(({ symbol, valueInBaseCurrency }) => {
      const allocation =
        portfolioAnalysis.totalValueInBaseCurrency > 0
          ? (valueInBaseCurrency / portfolioAnalysis.totalValueInBaseCurrency) *
            100
          : 0;

      return `${symbol} ${allocation.toFixed(2)}%`;
    })
    .join(', ');

  return [
    'Portfolio snapshot:',
    `Total portfolio value: ${portfolioAnalysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}.`,
    `Holdings: ${portfolioAnalysis.holdingsCount}.`,
    `Largest allocations: ${top || 'n/a'}.`
  ].join('\n');
}

function buildRiskSnapshotAnswer({
  riskAssessment
}: {
  riskAssessment?: ReturnType<typeof runRiskAssessment>;
}) {
  if (!riskAssessment) {
    return undefined;
  }

  return [
    'Risk snapshot:',
    `Top holding allocation: ${(riskAssessment.topHoldingAllocation * 100).toFixed(2)}%.`,
    `HHI concentration score: ${riskAssessment.hhi.toFixed(3)} (${riskAssessment.concentrationBand}).`,
    'Next step: reduce top concentration gradually with new cash or trims.'
  ].join('\n');
}

function buildSingleToolDeterministicAnswer({
  activityHistorySummary,
  demoDataSummary,
  assetFundamentalsSummary,
  financialNewsSummary,
  fireAnalysisSummary,
  marketData,
  portfolioAnalysis,
  priceHistorySummary,
  recentTransactionsSummary,
  rebalancePlanSummary,
  riskAssessment,
  stressTest,
  toolName,
  userCurrency
}: {
  activityHistorySummary?: string;
  demoDataSummary?: string;
  assetFundamentalsSummary?: string;
  financialNewsSummary?: string;
  fireAnalysisSummary?: string;
  marketData?: Awaited<ReturnType<typeof runMarketDataLookup>>;
  portfolioAnalysis?: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
  priceHistorySummary?: string;
  recentTransactionsSummary?: string;
  rebalancePlanSummary?: string;
  riskAssessment?: ReturnType<typeof runRiskAssessment>;
  stressTest?: ReturnType<typeof runStressTest>;
  toolName: AiAgentToolName;
  userCurrency: string;
}) {
  if (toolName === 'fire_analysis') {
    return fireAnalysisSummary;
  }

  if (toolName === 'get_financial_news') {
    return buildNewsBriefFromSummary(financialNewsSummary);
  }

  if (toolName === 'market_data_lookup' || toolName === 'get_live_quote') {
    return buildMarketSnapshotAnswer({ marketData, userCurrency });
  }

  if (toolName === 'price_history') {
    return priceHistorySummary;
  }

  if (toolName === 'portfolio_analysis' || toolName === 'get_portfolio_summary') {
    return buildPortfolioSnapshotAnswer({ portfolioAnalysis, userCurrency });
  }

  if (
    toolName === 'risk_assessment' ||
    toolName === 'get_portfolio_risk_metrics'
  ) {
    return buildRiskSnapshotAnswer({ riskAssessment });
  }

  if (toolName === 'get_recent_transactions') {
    return recentTransactionsSummary;
  }

  if (toolName === 'activity_history') {
    return activityHistorySummary;
  }

  if (toolName === 'demo_data') {
    return demoDataSummary;
  }

  if (toolName === 'get_asset_fundamentals') {
    return assetFundamentalsSummary;
  }

  if (toolName === 'rebalance_plan' || toolName === 'calculate_rebalance_plan') {
    return rebalancePlanSummary;
  }

  if (toolName === 'stress_test') {
    if (!stressTest || !portfolioAnalysis) {
      return undefined;
    }
    return [
      'Stress test results:',
      `Shock scenario: ${(stressTest.shockPercentage * 100).toFixed(0)}% market decline`,
      `Estimated drawdown: ${stressTest.estimatedDrawdownInBaseCurrency.toFixed(2)} ${userCurrency}`,
      `Current portfolio value: ${portfolioAnalysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}`,
      `Projected value: ${(portfolioAnalysis.totalValueInBaseCurrency - stressTest.estimatedDrawdownInBaseCurrency).toFixed(2)} ${userCurrency}`,
      'Note: Stress tests are hypothetical and do not capture all market risks.'
    ].join('\n');
  }

  return undefined;
}

function buildMultiToolDeterministicAnswer({
  portfolioAnalysis,
  rebalancePlanSummary,
  riskAssessment,
  toolsToExecute,
  userCurrency
}: {
  portfolioAnalysis?: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
  rebalancePlanSummary?: string;
  riskAssessment?: ReturnType<typeof runRiskAssessment>;
  toolsToExecute: AiAgentToolName[];
  userCurrency: string;
}): string | undefined {
  const toolsSet = new Set(toolsToExecute);

  const isPortfolioAndRisk =
    toolsSet.size === 2 &&
    toolsSet.has('portfolio_analysis') &&
    toolsSet.has('risk_assessment');
  const isPortfolioAndRebalance =
    toolsSet.size === 2 &&
    toolsSet.has('portfolio_analysis') &&
    (toolsSet.has('rebalance_plan') || toolsSet.has('calculate_rebalance_plan'));
  const isPortfolioAndRiskAndRebalance =
    toolsSet.size === 3 &&
    toolsSet.has('portfolio_analysis') &&
    toolsSet.has('risk_assessment') &&
    (toolsSet.has('rebalance_plan') || toolsSet.has('calculate_rebalance_plan'));

  if (isPortfolioAndRiskAndRebalance && portfolioAnalysis && riskAssessment && rebalancePlanSummary) {
    return [
      'Portfolio analysis:',
      buildPortfolioSnapshotAnswer({ portfolioAnalysis, userCurrency }) ?? '',
      '',
      buildRiskSnapshotAnswer({ riskAssessment }),
      '',
      `Rebalance plan: ${rebalancePlanSummary}`,
      '',
      'Next steps: Review concentration risk and consider gradual rebalancing to reduce drift.'
    ].filter(Boolean).join('\n');
  }

  if (isPortfolioAndRisk && portfolioAnalysis && riskAssessment) {
    return [
      buildPortfolioSnapshotAnswer({ portfolioAnalysis, userCurrency }) ?? '',
      '',
      buildRiskSnapshotAnswer({ riskAssessment })
    ].filter(Boolean).join('\n');
  }

  if (isPortfolioAndRebalance && portfolioAnalysis && rebalancePlanSummary) {
    return [
      buildPortfolioSnapshotAnswer({ portfolioAnalysis, userCurrency }) ?? '',
      '',
      `Rebalance plan: ${rebalancePlanSummary}`,
      '',
      'Next steps: Execute trims gradually and reallocate to underweight positions.'
    ].filter(Boolean).join('\n');
  }

  return undefined;
}

function calculateHhi({
  holdings,
  totalValue
}: {
  holdings: { valueInBaseCurrency: number }[];
  totalValue: number;
}) {
  if (totalValue <= 0) {
    return 0;
  }

  return holdings.reduce((sum, { valueInBaseCurrency }) => {
    const allocation = valueInBaseCurrency / totalValue;

    return sum + allocation * allocation;
  }, 0);
}

function buildRebalancePlanSimulationSummary({
  portfolioAnalysis,
  rebalancePlan
}: {
  portfolioAnalysis: PortfolioAnalysisResult;
  rebalancePlan: ReturnType<typeof runRebalancePlan>;
}): RebalancePlanSimulationSummary {
  const longHoldings: { symbol: string; valueInBaseCurrency: number }[] =
    portfolioAnalysis.holdings
      .filter(({ valueInBaseCurrency }) => {
        return valueInBaseCurrency > 0;
      })
      .map(({ symbol, valueInBaseCurrency }) => {
        return { symbol, valueInBaseCurrency };
      });
  const totalLongValue = longHoldings.reduce<number>(
    (sum, { valueInBaseCurrency }) => {
      return sum + valueInBaseCurrency;
    },
    0
  );

  if (totalLongValue === 0) {
    return {
      afterTopAllocation: 0,
      afterTopSymbol: 'N/A',
      beforeTopAllocation: 0,
      beforeTopSymbol: 'N/A',
      beforeHhi: 0,
      afterHhi: 0,
      driftImprovement: 0,
      tradeSummary: 'No long holdings available for rebalance simulation.'
    };
  }

  const beforeAllocations = longHoldings
    .map(({ symbol, valueInBaseCurrency }) => {
      return {
        allocation: valueInBaseCurrency / totalLongValue,
        symbol,
        valueInBaseCurrency
      };
    })
    .sort((a, b) => {
      return b.allocation - a.allocation;
    });
  const beforeTop = beforeAllocations[0];
  const beforeHhi = calculateHhi({
    holdings: longHoldings,
    totalValue: totalLongValue
  });
  const projectedBySymbol = new Map<string, number>(
    longHoldings.map(({ symbol, valueInBaseCurrency }) => {
      return [symbol, valueInBaseCurrency];
    })
  );
  const reductionTrades: string[] = [];
  let totalTrimmed = 0;

  for (const overweight of rebalancePlan.overweightHoldings) {
    const currentValue = projectedBySymbol.get(overweight.symbol) ?? 0;
    const reductionValue = Math.max(
      currentValue - rebalancePlan.maxAllocationTarget * totalLongValue,
      0
    );
    const trimmedValue = Math.min(currentValue, reductionValue);

    if (trimmedValue > 0) {
      projectedBySymbol.set(overweight.symbol, currentValue - trimmedValue);
      totalTrimmed += trimmedValue;
      reductionTrades.push(
        `${overweight.symbol} -${((trimmedValue / totalLongValue) * 100).toFixed(2)}pp`
      );
    }
  }

  const underweights = beforeAllocations
    .filter((holding) => {
      return holding.allocation < rebalancePlan.maxAllocationTarget;
    })
    .map((holding) => {
      return holding.symbol;
    });

  if (totalTrimmed > 0) {
    if (underweights.length > 0) {
      const perSymbolAdd = totalTrimmed / underweights.length;

      for (const symbol of underweights) {
        const currentValue = projectedBySymbol.get(symbol) ?? 0;
        projectedBySymbol.set(symbol, currentValue + perSymbolAdd);
      }
    } else {
      projectedBySymbol.set(
        'CASH',
        (projectedBySymbol.get('CASH') ?? 0) + totalTrimmed
      );
    }
  }

  const projectedHoldings: { symbol: string; valueInBaseCurrency: number }[] =
    Array.from(projectedBySymbol.entries())
      .filter(([, valueInBaseCurrency]) => {
        return valueInBaseCurrency > 0;
      })
      .map(([symbol, valueInBaseCurrency]) => {
        return { symbol, valueInBaseCurrency };
      })
      .sort((a, b) => {
        return b.valueInBaseCurrency - a.valueInBaseCurrency;
      });
  const afterTop = projectedHoldings[0];
  const afterHhi = calculateHhi({
    holdings: projectedHoldings,
    totalValue: totalLongValue
  });
  const driftImprovement = beforeHhi - afterHhi;

  return {
    afterTopAllocation: afterTop
      ? afterTop.valueInBaseCurrency / totalLongValue
      : 0,
    afterTopSymbol: afterTop?.symbol ?? 'N/A',
    beforeTopAllocation: beforeTop.allocation,
    beforeTopSymbol: beforeTop.symbol,
    beforeHhi,
    afterHhi,
    driftImprovement,
    tradeSummary: reductionTrades.join('; ') || 'No reduction actions required.'
  };
}

interface AiToolExecutionResult {
  citations: AiAgentCitation[];
  toolCall: AiAgentToolCall;
}

class AiToolRegistry {
  private readonly executionsByTool = new Map<AiAgentToolName, number>();
  private totalExecutions = 0;

  public constructor(
    private readonly options?: {
      maxToolCallsPerRequest?: number;
      maxToolCallsPerTool?: Partial<Record<AiAgentToolName, number>>;
    }
  ) {}

  public async executeTool(
    toolName: AiAgentToolName,
    executor: () => Promise<AiToolExecutionResult>
  ): Promise<AiToolExecutionResult> {
    const executionStartedAt = Date.now();
    const maxToolCallsPerRequest =
      this.options?.maxToolCallsPerRequest ??
      AI_TOOL_REGISTRY_MAX_CALLS_PER_REQUEST;
    const maxToolCallsPerTool = this.options?.maxToolCallsPerTool ?? {};

    if (this.totalExecutions >= maxToolCallsPerRequest) {
      return {
        citations: [],
        toolCall: {
          durationInMs: Date.now() - executionStartedAt,
          input: {
            toolName
          },
          outputSummary: `Tool execution blocked by policy: maximum of ${maxToolCallsPerRequest} tools per request exceeded.`,
          status: 'failed',
          tool: toolName
        }
      };
    }

    const currentExecutions = this.executionsByTool.get(toolName) ?? 0;
    const maxToolCalls =
      maxToolCallsPerTool[toolName] ??
      AI_TOOL_REGISTRY_DEFAULT_MAX_CALLS_PER_TOOL;

    if (currentExecutions >= maxToolCalls) {
      return {
        citations: [],
        toolCall: {
          durationInMs: Date.now() - executionStartedAt,
          input: {
            toolName
          },
          outputSummary: `Tool execution blocked by policy: max calls for ${toolName} exceeded.`,
          status: 'failed',
          tool: toolName
        }
      };
    }

    this.executionsByTool.set(toolName, currentExecutions + 1);
    this.totalExecutions += 1;

    const result = await executor();

    return {
      ...result,
      toolCall: {
        ...result.toolCall,
        durationInMs:
          result.toolCall.durationInMs ?? Date.now() - executionStartedAt
      }
    };
  }
}

type OrderActivity = Awaited<
  ReturnType<OrderService['getOrders']>
>['activities'][number];

@Injectable()
export class AiService implements AgentKernel {
  public constructor(
    private readonly accountService: AccountService,
    private readonly benchmarkService: BenchmarkService,
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly orderService: OrderService,
    private readonly portfolioService: PortfolioService,
    private readonly propertyService: PropertyService,
    private readonly redisCacheService: RedisCacheService,
    private readonly aiObservabilityService: AiObservabilityService,
    private readonly aiAgentWebSearchService?: AiAgentWebSearchService
  ) {}
  public async generateText({
    prompt,
    signal,
    model,
    traceContext,
    onLlmInvocation,
    useFormatterModel
  }: {
    prompt: string;
    signal?: AbortSignal;
    model?: string;
    onLlmInvocation?: (invocation: { model: string; provider: string }) => void;
    traceContext?: { query: string; sessionId: string; traceId: string; userId: string };
    useFormatterModel?: boolean;
  }): Promise<{ text?: string }> {
    const zAiGlmApiKey =
      process.env.z_ai_glm_api_key ?? process.env.Z_AI_GLM_API_KEY;
    const zAiGlmModel =
      process.env.z_ai_glm_model ?? process.env.Z_AI_GLM_MODEL;
    const minimaxApiKey =
      process.env.minimax_api_key ?? process.env.MINIMAX_API_KEY;
    const minimaxModel = process.env.minimax_model ?? process.env.MINIMAX_MODEL;
    const openAiApiKey =
      process.env.openai_api_key ?? process.env.OPENAI_API_KEY;
    const formatterModel =
      process.env.AI_AGENT_FORMATTER_MODEL ??
      process.env.openai_model ??
      process.env.OPENAI_MODEL ??
      'gpt-4o-mini';
    const openAiModel = useFormatterModel
      ? formatterModel
      : process.env.openai_model ??
        process.env.OPENAI_MODEL ??
        'gpt-4o-mini';
    const allowProviderFallbacks =
      useFormatterModel
        ? false
        : process.env.AI_AGENT_LLM_ALLOW_FALLBACKS === 'true';
    const normalizedModel = (useFormatterModel ? 'openai' : model ?? 'auto').toLowerCase();
    const requestedModel = [
      'auto',
      'glm',
      'minimax',
      'openai',
      'chatgpt'
    ].includes(normalizedModel)
      ? normalizedModel === 'chatgpt'
        ? 'openai'
        : normalizedModel
      : 'auto';
    const shouldTryGlm = requestedModel === 'auto' || requestedModel === 'glm';
    const shouldTryMinimax =
      requestedModel === 'auto' || requestedModel === 'minimax';
    const shouldTryOpenAi =
      requestedModel === 'auto' || requestedModel === 'openai';
    const providerUnavailable = (provider: string) =>
      `${provider}: not configured`;
    const providerErrors: string[] = [];
    const invokeProviderWithTracing = async ({
      model: providerModel,
      provider,
      run
    }: {
      model: string;
      provider: string;
      run: () => Promise<{ text?: string }>;
    }) => {
      const invocationRunnable = RunnableLambda.from(
        async ({
          model: runnableModel,
          prompt: runnablePrompt,
          provider: runnableProvider,
          query,
          sessionId,
          userId,
          traceId
        }: {
          model: string;
          prompt: string;
          provider: string;
          query?: string;
          sessionId?: string;
          userId?: string;
          traceId?: string;
        }) => {
          const startedAt = Date.now();
          let invocationError: unknown;
          let responseText: string | undefined;

          try {
            const response = await run();
            responseText = response?.text;

            onLlmInvocation?.({
              model: providerModel,
              provider
            });

            return response;
          } catch (error) {
            invocationError = error;
            throw error;
          } finally {
            void this.aiObservabilityService.recordLlmInvocation({
              durationInMs: Date.now() - startedAt,
              error: invocationError,
              model: runnableModel,
              prompt: runnablePrompt,
              provider: runnableProvider,
              query,
              responseText,
              sessionId,
              userId,
              traceId
            });
          }
        }
      );

      return invocationRunnable.invoke(
        {
          model: providerModel,
          prompt,
          provider,
          query: traceContext?.query,
          sessionId: traceContext?.sessionId,
          userId: traceContext?.userId,
          traceId: traceContext?.traceId
        },
        {
          metadata: {
            model: providerModel,
            provider,
            query: traceContext?.query ?? '',
            sessionId: traceContext?.sessionId ?? '',
            userId: traceContext?.userId ?? '',
            traceId: traceContext?.traceId ?? ''
          },
          runName: `ghostfolio_ai_llm_${provider}`,
          tags: ['ghostfolio-ai', 'llm-invocation', provider]
        }
      );
    };

    const invokeOpenRouterWithTracing = async () => {
      const openRouterApiKey = await this.propertyService.getByKey<string>(
        PROPERTY_API_KEY_OPENROUTER
      );
      const openRouterModel = await this.propertyService.getByKey<string>(
        PROPERTY_OPENROUTER_MODEL
      );
      if (!openRouterApiKey || !openRouterModel) {
        throw new Error('OpenRouter is not configured');
      }

      const openRouterService = createOpenRouter({
        apiKey: openRouterApiKey
      });

      return invokeProviderWithTracing({
        model: openRouterModel,
        provider: 'openrouter',
        run: async () => {
          const response = await generateText({
            prompt,
            abortSignal: signal,
            model: openRouterService.chat(openRouterModel)
          });

          if (typeof response.text !== 'string') {
            throw new Error('OpenRouter response does not contain text output');
          }

          return {
            text: response.text
          };
        }
      });
    };

    if (requestedModel === 'auto' && !allowProviderFallbacks) {
      if (openAiApiKey) {
        return invokeProviderWithTracing({
          model: openAiModel,
          provider: 'openai',
          run: () =>
            generateTextWithOpenAI({
              apiKey: openAiApiKey,
              model: openAiModel,
              prompt,
              signal
            })
        });
      }

      if (minimaxApiKey) {
        return invokeProviderWithTracing({
          model: minimaxModel ?? 'MiniMax-M2.5',
          provider: 'minimax',
          run: () =>
            generateTextWithMinimax({
              apiKey: minimaxApiKey,
              model: minimaxModel,
              prompt,
              signal
            })
        });
      }

      if (zAiGlmApiKey) {
        return invokeProviderWithTracing({
          model: zAiGlmModel ?? 'glm-5',
          provider: 'z_ai_glm',
          run: () =>
            generateTextWithZAiGlm({
              apiKey: zAiGlmApiKey,
              model: zAiGlmModel,
              prompt,
              signal
            })
        });
      }

      return invokeOpenRouterWithTracing();
    }

    if (shouldTryOpenAi) {
      if (!openAiApiKey) {
        if (requestedModel === 'openai') {
          throw new Error(providerUnavailable('openai'));
        }

        providerErrors.push(providerUnavailable('openai'));
      } else {
        try {
          return await invokeProviderWithTracing({
            model: openAiModel,
            provider: 'openai',
            run: () =>
              generateTextWithOpenAI({
                apiKey: openAiApiKey,
                model: openAiModel,
                prompt,
                signal
              })
          });
        } catch (error) {
          providerErrors.push(
            `openai: ${
              error instanceof Error ? error.message : 'request failed'
            }`
          );
        }
      }
    }

    if (shouldTryMinimax) {
      if (!minimaxApiKey) {
        providerErrors.push(providerUnavailable('minimax'));
      } else {
        try {
          return await invokeProviderWithTracing({
            model: minimaxModel ?? 'MiniMax-M2.5',
            provider: 'minimax',
            run: () =>
              generateTextWithMinimax({
                apiKey: minimaxApiKey,
                model: minimaxModel,
                prompt,
                signal
              })
          });
        } catch (error) {
          providerErrors.push(
            `minimax: ${error instanceof Error ? error.message : 'request failed'}`
          );
        }
      }
    }

    if (shouldTryGlm) {
      if (!zAiGlmApiKey) {
        if (requestedModel === 'glm') {
          throw new Error(providerUnavailable('z_ai_glm'));
        }

        providerErrors.push(providerUnavailable('z_ai_glm'));
      } else {
        try {
          return await invokeProviderWithTracing({
            model: zAiGlmModel ?? 'glm-5',
            provider: 'z_ai_glm',
            run: () =>
              generateTextWithZAiGlm({
                apiKey: zAiGlmApiKey,
                model: zAiGlmModel,
                prompt,
                signal
              })
          });
        } catch (error) {
          if (requestedModel === 'glm') {
            throw new Error(
              error instanceof Error ? error.message : 'request failed'
            );
          }

          providerErrors.push(
            `z_ai_glm: ${error instanceof Error ? error.message : 'request failed'}`
          );
        }
      }
    }

    try {
      return await invokeOpenRouterWithTracing();
    } catch (error) {
      throw new Error(
        providerErrors.length > 0
          ? `No AI provider configured (${providerErrors.join('; ')})`
          : error instanceof Error
            ? error.message
            : 'OpenRouter is not configured'
      );
    }
  }

  public async run(request: AiAgentChatRequest): Promise<AiAgentChatResponse> {
    return this.chat(request);
  }

  public async chat({
    languageCode,
    query,
    conversationId,
    sessionId,
    symbols,
    model,
    nextResponsePreference,
    userCurrency,
    userId
  }: AiAgentChatRequest): Promise<AiAgentChatResponse> {
    if (!userId?.trim()) {
      throw new Error('MISSING_USER_ID');
    }

    const normalizedQuery = query.trim();
    const preferredStyleInstruction = nextResponsePreference?.trim() ?? '';
    const queryForTools = normalizedQuery;
    const queryForPrompt =
      preferredStyleInstruction.length > 0
        ? `${normalizedQuery}\n\nUser preference for this response: ${preferredStyleInstruction}`
        : normalizedQuery;
    const resolvedSessionId =
      conversationId?.trim() || sessionId?.trim() || randomUUID();
    const chatStartedAt = Date.now();
    const traceId = randomUUID();
    let llmGenerationInMs = 0;
    let memoryReadInMs = 0;
    let memoryWriteInMs = 0;
    let toolExecutionInMs = 0;

    try {
      const memoryReadStartedAt = Date.now();
      const [memory, userPreferences] = await Promise.all([
        getMemory({
          redisCacheService: this.redisCacheService,
          sessionId: resolvedSessionId,
          userId
        }),
        getUserPreferences({
          redisCacheService: this.redisCacheService,
          userId
        })
      ]);
      memoryReadInMs = Date.now() - memoryReadStartedAt;

      const inferredPlannedTools = determineToolPlan({
        query: queryForTools,
        symbols
      });
      const previousTurn =
        memory.turns.length > 0
          ? memory.turns[memory.turns.length - 1]
          : undefined;
      const previousSuccessfulTools = previousTurn
        ? Array.from(
            new Set(
              previousTurn.toolCalls
                .filter(({ status }) => {
                  return status === 'success';
                })
                .map(({ tool }) => tool)
            )
          )
        : [];
      const previousTurnForFollowUp: AiAgentFollowUpResolverPreviousTurn | undefined =
        previousTurn
          ? {
              context: previousTurn.context
                ? {
                    entities: previousTurn.context.entities,
                    goalType: previousTurn.context.goalType,
                    primaryScope: previousTurn.context.primaryScope
                  }
                : undefined,
              query: previousTurn.query,
              successfulTools: previousSuccessfulTools,
              timestamp: previousTurn.timestamp
            }
          : undefined;
      const followUpSignal = resolveFollowUpSignal({
        inferredPlannedTools,
        previousTurn: previousTurnForFollowUp,
        query: queryForTools
      });
      const hasFollowUpReuseOpportunity =
        inferredPlannedTools.length === 0 &&
        followUpSignal.isLikelyFollowUp &&
        !isConversationalAcknowledgmentQuery(queryForTools) &&
        previousSuccessfulTools.length > 0;
      const freshnessFollowUpTools = FOLLOW_UP_FRESHNESS_PATTERN.test(
        queryForTools
      )
        ? previousSuccessfulTools.filter((toolName) => {
            return FOLLOW_UP_FRESHNESS_TOOLS.has(toolName);
          })
        : [];
      const plannedTools = hasFollowUpReuseOpportunity
        ? freshnessFollowUpTools.length > 0
          ? freshnessFollowUpTools
          : previousSuccessfulTools
        : inferredPlannedTools;
      const policyDecision = applyToolExecutionPolicy({
        followUpSignal,
        plannedTools,
        query: queryForTools,
        policyLimits: {
          maxToolCallsPerRequest: AI_TOOL_REGISTRY_MAX_CALLS_PER_REQUEST
        }
      });

      const shouldBypassResponseCache = AI_CACHE_BYPASS_PATTERN.test(normalizedQuery);
      let responseCacheKey: string | undefined;
      let cachedResponse: string | undefined;
      const parseCachedResponse = (
        rawValue: string | undefined
      ): CachedResponsePayload | undefined => {
        if (!rawValue) {
          return undefined;
        }

        try {
          const parsed = JSON.parse(rawValue) as CachedResponsePayload;

          if (typeof parsed?.answer !== 'string' || parsed.answer.length === 0) {
            return undefined;
          }

          return parsed;
        } catch {
          return undefined;
        }
      };

      if (!shouldBypassResponseCache && policyDecision.route === 'tools') {
        const toolsHash = policyDecision.toolsToExecute.sort().join(',');
        const queryHash = Buffer.from(normalizedQuery).toString('base64').slice(0, 16);
        let portfolioVersion = 'na';
        const needsPortfolioVersion = policyDecision.toolsToExecute.some((toolName) => {
          return PORTFOLIO_STATE_SENSITIVE_TOOLS.has(toolName);
        });

        if (needsPortfolioVersion) {
          try {
            const { holdings } = await this.portfolioService.getDetails({
              impersonationId: undefined,
              userId
            });
            portfolioVersion = buildPortfolioStateVersion(holdings);
          } catch {
            portfolioVersion = 'unavailable';
          }
        }

        responseCacheKey = `ai:response:${userId}:${queryHash}:${toolsHash}:${portfolioVersion}`;
        try {
          const cachedPayload = parseCachedResponse(
            await this.redisCacheService.get(responseCacheKey)
          );
          cachedResponse = cachedPayload?.answer;
          if (cachedResponse) {
            return {
              answer: cachedResponse,
              citations: [],
              confidence: { band: 'high', score: 0.9 },
              memory: {
                sessionId: resolvedSessionId,
                turns: 0
              },
              toolCalls: [],
              verification: [
                {
                  check: 'response_cache',
                  details: 'Response served from cache',
                  status: 'passed'
                }
              ]
            } satisfies AiAgentChatResponse;
          }
        } catch {}
      }

      const preferenceUpdate = resolvePreferenceUpdate({
        query: queryForTools,
        userPreferences
      });
      const effectiveUserPreferences = preferenceUpdate.userPreferences;
      const toolCalls: AiAgentToolCall[] = [];
      const citations: AiAgentChatResponse['citations'] = [];
      const verification: AiAgentChatResponse['verification'] = [];
      const actionExecutionSummaries: string[] = [];
      const explicitRequestedSymbols = symbols?.length
        ? symbols
        : extractSymbolsFromQuery(queryForTools);
      const hasExplicitSymbolRequest = explicitRequestedSymbols.length > 0;
      const hasPortfolioSymbolContext =
        PORTFOLIO_SYMBOL_CONTEXT_QUERY_PATTERN.test(queryForTools);
      const hasExtendedTickerResearchStack =
        policyDecision.toolsToExecute.includes('get_financial_news') ||
        policyDecision.toolsToExecute.includes('price_history');
      const shouldForceExternalSymbolContext =
        hasExplicitSymbolRequest &&
        !hasPortfolioSymbolContext &&
        hasExtendedTickerResearchStack;
      let llmInvocation:
        | {
            model: string;
            provider: string;
          }
        | undefined;
      let portfolioAnalysis: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
      let riskAssessment: ReturnType<typeof runRiskAssessment>;
      let marketData: Awaited<ReturnType<typeof runMarketDataLookup>>;
      let rebalancePlan: ReturnType<typeof runRebalancePlan>;
      let stressTest: ReturnType<typeof runStressTest>;
      let assetFundamentalsSummary: string | undefined;
      let accountOverviewSummary: string | undefined;
      let activityHistorySummary: string | undefined;
      let benchmarkSummary: string | undefined;
      let complianceCheckSummary: string | undefined;
      let demoDataSummary: string | undefined;
      let exchangeRateSummary: string | undefined;
      let financialNewsSummary: string | undefined;
      let rebalancePlanSummary: string | undefined;
      let priceHistorySummary: string | undefined;
      let fireAnalysisSummary: string | undefined;
      let recentTransactionsSummary: string | undefined;
      let symbolLookupSummary: string | undefined;
      let taxEstimateSummary: string | undefined;
      let tradeImpactSummary: string | undefined;
      let transactionCategorizationSummary: string | undefined;
      const portfolioAnalysisCacheKey = `ai:portfolio-analysis:${userId}`;
      let backgroundPortfolioRefreshPromise: Promise<void> | undefined;

      const parseCachedPortfolioAnalysis = (
        rawValue: string | undefined
      ): CachedPortfolioAnalysisPayload | undefined => {
        if (!rawValue) {
          return undefined;
        }

        try {
          const parsed = JSON.parse(rawValue) as CachedPortfolioAnalysisPayload;
          const updatedAt = Date.parse(parsed.updatedAt);

          if (
            Number.isNaN(updatedAt) ||
            !parsed?.data ||
            Date.now() - updatedAt > AI_PORTFOLIO_ANALYSIS_CACHE_MAX_AGE_IN_MS
          ) {
            return undefined;
          }

          return parsed;
        } catch {
          return undefined;
        }
      };

      const storePortfolioAnalysisCache = async (
        analysis: Awaited<ReturnType<typeof runPortfolioAnalysis>>
      ) => {
        try {
          await this.redisCacheService.set(
            portfolioAnalysisCacheKey,
            JSON.stringify({
              data: analysis,
              updatedAt: new Date().toISOString()
            } satisfies CachedPortfolioAnalysisPayload),
            AI_PORTFOLIO_ANALYSIS_CACHE_TTL_IN_MS
          );
        } catch {}
      };

      const shouldUsePortfolioContextForSymbols =
        policyDecision.toolsToExecute.some((toolName) => {
          return PORTFOLIO_CONTEXT_SYMBOL_TOOLS.has(toolName);
        }) && !shouldForceExternalSymbolContext;
      const maxOrderTakeForRequest = policyDecision.toolsToExecute.reduce(
        (maxTake, toolName) => {
          const requiredTake = ORDER_TOOL_TAKE_BY_NAME[toolName] ?? 0;

          return Math.max(maxTake, requiredTake);
        },
        0
      );
      let portfolioAnalysisPromise:
        | Promise<Awaited<ReturnType<typeof runPortfolioAnalysis>>>
        | undefined;
      let resolvedSymbolsPromise: Promise<string[]> | undefined;
      let orderActivitiesPromise: Promise<OrderActivity[]> | undefined;
      const marketDataBySymbolsCache = new Map<
        string,
        Promise<Awaited<ReturnType<typeof runMarketDataLookup>>>
      >();
      const assetProfilesBySymbolsCache = new Map<
        string,
        Promise<Record<string, Partial<SymbolProfile>>>
      >();
      const financialNewsBySymbolsCache = new Map<
        string,
        Promise<Awaited<ReturnType<typeof searchWebNewsForSymbols>>>
      >();

      const getPortfolioAnalysis = () => {
        portfolioAnalysisPromise ??= runPortfolioAnalysis({
          portfolioService: this.portfolioService,
          userId
        })
          .then(async (analysis) => {
            portfolioAnalysis = analysis;
            await storePortfolioAnalysisCache(analysis);

            return analysis;
          });

        return portfolioAnalysisPromise;
      };

      const getPortfolioAnalysisWithCache = async () => {
        if (portfolioAnalysis) {
          return portfolioAnalysis;
        }

        try {
          const cached = parseCachedPortfolioAnalysis(
            await this.redisCacheService.get(portfolioAnalysisCacheKey)
          );

          if (cached?.data) {
            portfolioAnalysis = cached.data;

            if (!backgroundPortfolioRefreshPromise) {
              backgroundPortfolioRefreshPromise = runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              })
                .then(async (freshAnalysis) => {
                  portfolioAnalysis = freshAnalysis;
                  await storePortfolioAnalysisCache(freshAnalysis);
                })
                .catch(() => undefined);
            }

            return cached.data;
          }
        } catch {}

        return getPortfolioAnalysis();
      };

      const getResolvedSymbols = async () => {
        resolvedSymbolsPromise ??= (async () => {
          let analysisForResolution = portfolioAnalysis;

          if (shouldUsePortfolioContextForSymbols) {
            try {
              analysisForResolution = await getPortfolioAnalysisWithCache();
            } catch {
              analysisForResolution = portfolioAnalysis;
            }
          }

          return resolveSymbols({
            portfolioAnalysis: analysisForResolution,
            query: normalizedQuery,
            symbols
          });
        })();

        return resolvedSymbolsPromise;
      };

      const getMarketDataBySymbols = async (requestedSymbols: string[]) => {
        const cacheKey = [...requestedSymbols].sort().join('|');

        if (!marketDataBySymbolsCache.has(cacheKey)) {
          marketDataBySymbolsCache.set(
            cacheKey,
            (async () => {
              const analysisForMarketData = shouldUsePortfolioContextForSymbols
                ? await getPortfolioAnalysis()
                : portfolioAnalysis;
              const marketDataLookupResult = await runMarketDataLookup({
                dataProviderService: this.dataProviderService,
                portfolioAnalysis: analysisForMarketData,
                symbols: requestedSymbols
              });
              marketData = marketDataLookupResult;

              return marketDataLookupResult;
            })()
          );
        }

        const marketDataLookup = await marketDataBySymbolsCache.get(cacheKey);
        marketData = marketDataLookup;

        return marketDataLookup;
      };

      const getAssetProfilesBySymbols = async (requestedSymbols: string[]) => {
        if (requestedSymbols.length === 0) {
          return {} as Record<string, Partial<SymbolProfile>>;
        }

        const analysis = shouldUsePortfolioContextForSymbols
          ? await getPortfolioAnalysis()
          : portfolioAnalysis;
        const symbolIdentifiers = this.extractSymbolIdentifiersFromPortfolio({
          portfolioAnalysis: analysis,
          symbols: requestedSymbols
        });
        const cacheKey = symbolIdentifiers
          .map(({ dataSource, symbol }) => {
            return `${dataSource}:${symbol}`;
          })
          .sort()
          .join('|');

        if (!assetProfilesBySymbolsCache.has(cacheKey)) {
          assetProfilesBySymbolsCache.set(
            cacheKey,
            this.dataProviderService.getAssetProfiles(symbolIdentifiers)
          );
        }

        return assetProfilesBySymbolsCache.get(cacheKey);
      };

      const getRecentActivities = async (take: number) => {
        if (orderActivitiesPromise === undefined) {
          const effectiveTake =
            maxOrderTakeForRequest > 0 ? maxOrderTakeForRequest : take;
          orderActivitiesPromise = this.orderService
            .getOrders({
              sortColumn: 'date',
              sortDirection: 'desc',
              take: effectiveTake,
              userCurrency,
              userId
            })
            .then(({ activities }) => {
              return activities;
            });
        }

        const orderActivities = await orderActivitiesPromise;

        return orderActivities.slice(0, take);
      };

      const getFinancialNewsBySymbols = async (requestedSymbols: string[]) => {
        const cacheKey = [...requestedSymbols].sort().join('|');

        if (!financialNewsBySymbolsCache.has(cacheKey)) {
          financialNewsBySymbolsCache.set(
            cacheKey,
            searchWebNewsForSymbols({
              aiAgentWebSearchService:
                this.aiAgentWebSearchService ?? new AiAgentWebSearchService(),
              dataProviderService: this.dataProviderService,
              portfolioAnalysis: shouldUsePortfolioContextForSymbols
                ? await getPortfolioAnalysis()
                : portfolioAnalysis,
              symbols: requestedSymbols
            })
          );
        }

        return financialNewsBySymbolsCache.get(cacheKey);
      };

      const toolExecutionStartedAt = Date.now();
      const toolExecutionRegistry = new AiToolRegistry({
        maxToolCallsPerRequest: policyDecision.limits?.maxToolCallsPerRequest,
        maxToolCallsPerTool: policyDecision.limits?.maxToolCallsPerTool
      });
      const toolOutcomes = await Promise.all(
        policyDecision.toolsToExecute.map(async (toolName) => {
          return toolExecutionRegistry.executeTool(toolName, async () => {
            try {
              if (toolName === 'portfolio_analysis') {
                const analysis = await getPortfolioAnalysisWithCache();
                const topAllocation = analysis.holdings
                  .slice(0, 3)
                  .map(({ symbol, valueInBaseCurrency }) => {
                    const percent =
                      analysis.totalValueInBaseCurrency > 0
                        ? (valueInBaseCurrency /
                            analysis.totalValueInBaseCurrency) *
                          100
                        : 0;

                    return `${symbol} ${percent.toFixed(2)}%`;
                  })
                  .join(', ');
                const normalizedAllocationSum =
                  analysis.allocationSum <= 2
                    ? analysis.allocationSum * 100
                    : analysis.allocationSum;

                return {
                  citations: [
                    {
                      confidence: 0.9,
                      snippet: `${analysis.holdingsCount} holdings, top allocations: ${topAllocation || 'none'}, allocationSum ${normalizedAllocationSum.toFixed(4)}%`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {},
                    outputSummary: `portfolio_analysis: holdings=${analysis.holdingsCount}, total=${analysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}, allocationSum=${normalizedAllocationSum.toFixed(4)}%`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'get_portfolio_summary') {
                const analysis = await getPortfolioAnalysisWithCache();

                return {
                  citations: [
                    {
                      confidence: 0.9,
                      snippet: `Portfolio summary: ${analysis.holdingsCount} holdings, total ${analysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {},
                    outputSummary: `portfolio total ${analysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'get_current_holdings') {
                const analysis = await getPortfolioAnalysisWithCache();
                const holdingsSummary = analysis.holdings
                  .slice(0, 3)
                  .map(({ allocationInPercentage, symbol }) => {
                    return `${symbol} ${(allocationInPercentage * 100).toFixed(1)}%`;
                  })
                  .join(', ');

                return {
                  citations: [
                    {
                      confidence: 0.88,
                      snippet:
                        holdingsSummary.length > 0
                          ? `Current holdings: ${holdingsSummary}`
                          : 'Current holdings are available with no active positions',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {},
                    outputSummary: `${analysis.holdingsCount} current holdings returned`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'risk_assessment') {
                const analysis = await getPortfolioAnalysisWithCache();
                const currentRiskAssessment = runRiskAssessment({
                  portfolioAnalysis: analysis
                });
                riskAssessment = currentRiskAssessment;

                return {
                  citations: [
                    {
                      confidence: 0.85,
                      snippet: `top allocation ${(currentRiskAssessment.topHoldingAllocation * 100).toFixed(2)}%, HHI ${currentRiskAssessment.hhi.toFixed(3)}`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {},
                    outputSummary: `risk_assessment: concentration=${currentRiskAssessment.concentrationBand}, topHolding=${(
                      currentRiskAssessment.topHoldingAllocation * 100
                    ).toFixed(
                      2
                    )}%, HHI=${currentRiskAssessment.hhi.toFixed(3)}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'get_portfolio_risk_metrics') {
                const analysis = await getPortfolioAnalysisWithCache();
                const currentRiskAssessment = runRiskAssessment({
                  portfolioAnalysis: analysis
                });
                riskAssessment = currentRiskAssessment;

                return {
                  citations: [
                    {
                      confidence: 0.87,
                      snippet: `Risk metrics: concentration ${currentRiskAssessment.concentrationBand}, top allocation ${(currentRiskAssessment.topHoldingAllocation * 100).toFixed(2)}%, HHI ${currentRiskAssessment.hhi.toFixed(3)}`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {},
                    outputSummary: `get_portfolio_risk_metrics: concentration=${currentRiskAssessment.concentrationBand}, topHolding=${(
                      currentRiskAssessment.topHoldingAllocation * 100
                    ).toFixed(
                      2
                    )}%, HHI=${currentRiskAssessment.hhi.toFixed(3)}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'market_data_lookup') {
                const requestedSymbols = await getResolvedSymbols();
                const currentMarketData =
                  await getMarketDataBySymbols(requestedSymbols);
                const topQuote = currentMarketData.quotes[0];
                const resolvedSymbols = currentMarketData.quotes.map(
                  ({ symbol }) => symbol
                );
                const unresolvedSymbols =
                  currentMarketData.symbolsRequested.filter((symbol) => {
                    return !resolvedSymbols.includes(symbol);
                  });

                return {
                  citations:
                    topQuote !== undefined
                      ? [
                          {
                            confidence: 0.82,
                            snippet: `${topQuote.symbol} ${topQuote.marketPrice.toFixed(2)} ${topQuote.currency}`,
                            source: toolName
                          }
                        ]
                      : [],
                  toolCall: {
                    input: { symbols: requestedSymbols },
                    outputSummary: `market_data_lookup.inputSymbols=${(
                      currentMarketData.symbolsRequested ?? []
                    ).join(
                      ','
                    )}; resolvedSymbols=${resolvedSymbols.join(',')}; unresolvedSymbols=${unresolvedSymbols.join(',')}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'get_live_quote') {
                const requestedSymbols = await getResolvedSymbols();
                const currentMarketData =
                  await getMarketDataBySymbols(requestedSymbols);
                const topQuote = currentMarketData.quotes[0];

                return {
                  citations:
                    topQuote !== undefined
                      ? [
                          {
                            confidence: 0.82,
                            snippet: `Live quote: ${topQuote.symbol} ${topQuote.marketPrice.toFixed(2)} ${topQuote.currency}`,
                            source: toolName
                          }
                        ]
                      : [],
                  toolCall: {
                    input: { symbols: requestedSymbols },
                    outputSummary: `${currentMarketData.quotes.length}/${currentMarketData.symbolsRequested.length} live quotes resolved`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'account_overview') {
                const accounts = await this.accountService.getAccounts(userId);
                const totalBalance = accounts.reduce((total, account) => {
                  return total + Number(account.balance ?? 0);
                }, 0);
                const topAccounts = accounts
                  .slice(0, 3)
                  .map((account) => {
                    return `${account.name} ${Number(account.balance ?? 0).toFixed(2)} ${account.currency}`;
                  })
                  .join(', ');

                accountOverviewSummary =
                  accounts.length > 0
                    ? [
                        `Account overview: ${accounts.length} accounts.`,
                        `Total account cash balance: ${totalBalance.toFixed(2)} ${userCurrency}.`,
                        `Top accounts: ${topAccounts || 'n/a'}.`
                      ].join('\n')
                    : 'Account overview: no accounts found.';

                return {
                  citations: [
                    {
                      confidence: accounts.length > 0 ? 0.82 : 0.62,
                      snippet:
                        accounts.length > 0
                          ? `Accounts ${accounts.length}, total balance ${totalBalance.toFixed(2)} ${userCurrency}`
                          : 'No accounts found',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {},
                    outputSummary: `${accounts.length} accounts summarized`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'exchange_rate') {
                const exchangeRateInput = this.extractExchangeRateInput({
                  baseCurrency: userCurrency,
                  query: normalizedQuery
                });
                const rate = this.exchangeRateDataService.toCurrency(
                  1,
                  exchangeRateInput.from,
                  exchangeRateInput.to
                );

                exchangeRateSummary = `Exchange rate snapshot: 1 ${exchangeRateInput.from} = ${rate.toFixed(4)} ${exchangeRateInput.to}.`;

                return {
                  citations: [
                    {
                      confidence: 0.8,
                      snippet: exchangeRateSummary,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: exchangeRateInput,
                    outputSummary: `1 ${exchangeRateInput.from} -> ${rate.toFixed(4)} ${exchangeRateInput.to}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'price_history') {
                const requestedSymbols = await getResolvedSymbols();
                const lookup = await getMarketDataBySymbols(requestedSymbols);
                const symbol =
                  lookup.quotes[0]?.symbol ??
                  requestedSymbols.find((candidate) => {
                    return /^[A-Z0-9]{1,6}(?:\.[A-Z0-9]{1,4})?$/.test(
                      candidate
                    );
                  }) ??
                  requestedSymbols[0] ??
                  'SPY';
                const to = new Date();
                const from = new Date(to);
                from.setDate(to.getDate() - 30);
                const historicalData =
                  await this.dataProviderService.getHistorical(
                    [{ dataSource: DataSource.YAHOO, symbol }],
                    'day',
                    from,
                    to
                  );
                const points = Object.entries(historicalData[symbol] ?? {})
                  .map(([, value]) => {
                    return value?.marketPrice;
                  })
                  .filter((value): value is number => Number.isFinite(value));
                const first = points[0];
                const last = points[points.length - 1];
                const changeInPercent =
                  Number.isFinite(first) && Number.isFinite(last) && first !== 0
                    ? ((last - first) / first) * 100
                    : undefined;

                priceHistorySummary =
                  points.length > 0
                    ? `Price history (${symbol}, 30d): ${points.length} points, latest ${last.toFixed(2)} ${userCurrency}${typeof changeInPercent === 'number' ? `, change ${changeInPercent.toFixed(2)}%` : ''}.`
                    : `Price history (${symbol}): no historical points found for the selected window.`;

                return {
                  citations: [
                    {
                      confidence: points.length > 0 ? 0.79 : 0.62,
                      snippet: priceHistorySummary,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {
                      from: from.toISOString(),
                      symbol,
                      to: to.toISOString()
                    },
                    outputSummary: `${points.length} historical points returned for ${symbol}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'symbol_lookup') {
                const symbolsFromQuery =
                  extractSymbolsFromQuery(normalizedQuery);

                symbolLookupSummary =
                  symbolsFromQuery.length > 0
                    ? `Symbol lookup: matched ${symbolsFromQuery.join(', ')} from the query.`
                    : 'Symbol lookup: no ticker symbol found in the query text.';

                return {
                  citations: [
                    {
                      confidence: symbolsFromQuery.length > 0 ? 0.78 : 0.6,
                      snippet: symbolLookupSummary,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: { query: normalizedQuery },
                    outputSummary: `${symbolsFromQuery.length} symbols matched`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'market_benchmarks') {
                const benchmarks = await this.benchmarkService.getBenchmarks({
                  useCache: true
                });
                const topBenchmarks = benchmarks
                  .slice(0, 3)
                  .map(({ symbol, trend50d, trend200d }) => {
                    return `${symbol} (50d ${trend50d}, 200d ${trend200d})`;
                  })
                  .join(', ');

                benchmarkSummary =
                  benchmarks.length > 0
                    ? `Market benchmarks: ${topBenchmarks}.`
                    : 'Market benchmarks: no benchmark entries available.';

                return {
                  citations: [
                    {
                      confidence: benchmarks.length > 0 ? 0.8 : 0.62,
                      snippet: benchmarkSummary,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {},
                    outputSummary: `${benchmarks.length} benchmark entries returned`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'activity_history') {
                const activities = await getRecentActivities(20);
                const typeCounts = new Map<string, number>();

                for (const activity of activities) {
                  const normalizedType = String(
                    activity.type ?? 'UNKNOWN'
                  ).toUpperCase();
                  typeCounts.set(
                    normalizedType,
                    (typeCounts.get(normalizedType) ?? 0) + 1
                  );
                }

                const typeSummary = Array.from(typeCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([type, count]) => `${type} ${count}`)
                  .join(', ');

                activityHistorySummary =
                  activities.length > 0
                    ? `Activity history: ${activities.length} recent entries. Top activity types: ${typeSummary || 'n/a'}.`
                    : 'Activity history: no recent entries found.';

                return {
                  citations: [
                    {
                      confidence: activities.length > 0 ? 0.8 : 0.62,
                      snippet: activityHistorySummary,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: { take: 20 },
                    outputSummary: `${activities.length} activities summarized`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'demo_data') {
                demoDataSummary =
                  'Demo data mode: sample flow includes account overview, benchmark comparison, and scenario analysis prompts without placing trades.';

                return {
                  citations: [
                    {
                      confidence: 0.72,
                      snippet: demoDataSummary,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {},
                    outputSummary: 'demo workflow summary returned',
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'seed_funds') {
                const seedFundsInput = this.extractSeedFundsInput({
                  baseCurrency: userCurrency,
                  query: normalizedQuery
                });

                if (!seedFundsInput.hasAmount) {
                  throw new Error(
                    'Seed funds request is missing amount. Provide a numeric value, for example: "Add 1000 USD seed money".'
                  );
                }

                const userAccounts = await this.accountService.getAccounts(userId);
                const accountId = userAccounts[0]?.id;

                if (!accountId) {
                  throw new Error('No account available to add seed funds');
                }

                const seedSymbol = `GF_SEED_${Date.now()}`;
                const createdOrder = await this.orderService.createOrder({
                  accountId,
                  comment: 'Seed funds added',
                  currency: seedFundsInput.currency,
                  date: new Date(),
                  fee: 0,
                  quantity: 1,
                  SymbolProfile: {
                    connectOrCreate: {
                      create: {
                        currency: seedFundsInput.currency,
                        dataSource: DataSource.MANUAL,
                        symbol: seedSymbol
                      },
                      where: {
                        dataSource_symbol: {
                          dataSource: DataSource.MANUAL,
                          symbol: seedSymbol
                        }
                      }
                    }
                  },
                  type: Type.INTEREST,
                  unitPrice: seedFundsInput.amount,
                  updateAccountBalance: true,
                  user: { connect: { id: userId } },
                  userId
                });

                return {
                  citations: [
                    {
                      confidence: 0.87,
                      snippet: `Seed funds added: ${seedFundsInput.amount.toFixed(
                        2
                      )} ${seedFundsInput.currency} to account.`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: seedFundsInput,
                    outputSummary: `seed funds order ${createdOrder.id} created`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'create_account') {
                const accountInput = this.extractCreateAccountInput({
                  baseCurrency: userCurrency,
                  query: normalizedQuery
                });
                const createdAccount = await this.accountService.createAccount(
                  {
                    balance: accountInput.balance,
                    currency: accountInput.currency,
                    name: accountInput.name,
                    user: { connect: { id: userId } }
                  },
                  userId
                );

                return {
                  citations: [
                    {
                      confidence: 0.85,
                      snippet: `Created account ${createdAccount.name} (${createdAccount.currency}) with opening balance ${Number(createdAccount.balance ?? 0).toFixed(2)}.`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: accountInput,
                    outputSummary: `account ${createdAccount.name} created`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'create_order') {
                const orderInput = this.extractCreateOrderInput({
                  baseCurrency: userCurrency,
                  query: normalizedQuery
                });

                if (
                  !orderInput.hasSymbol ||
                  !orderInput.hasQuantity ||
                  !orderInput.hasUnitPrice
                ) {
                  throw new Error(
                    'Order request is missing required details. Provide symbol, quantity, and unit price (for example: "Buy 10 shares of TSLA at 250 USD").'
                  );
                }
                const userAccounts =
                  await this.accountService.getAccounts(userId);
                const accountId = userAccounts[0]?.id;

                if (!accountId) {
                  throw new Error('No account available to place an order');
                }

                const createdOrder = await this.orderService.createOrder({
                  accountId,
                  currency: orderInput.currency,
                  date: new Date(),
                  fee: 0,
                  quantity: orderInput.quantity,
                  SymbolProfile: {
                    connectOrCreate: {
                      create: {
                        currency: orderInput.currency,
                        dataSource: DataSource.YAHOO,
                        symbol: orderInput.symbol
                      },
                      where: {
                        dataSource_symbol: {
                          dataSource: DataSource.YAHOO,
                          symbol: orderInput.symbol
                        }
                      }
                    }
                  },
                  type: orderInput.type,
                  unitPrice: orderInput.unitPrice,
                  updateAccountBalance: false,
                  user: { connect: { id: userId } },
                  userId
                });

                return {
                  citations: [
                    {
                      confidence: 0.84,
                      snippet: `Created order ${createdOrder.type} ${orderInput.quantity} ${orderInput.symbol} at ${orderInput.unitPrice.toFixed(2)} ${orderInput.currency}.`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: orderInput,
                    outputSummary: `order ${createdOrder.id} created`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'get_asset_fundamentals') {
                let analysis = portfolioAnalysis;

                if (shouldUsePortfolioContextForSymbols) {
                  try {
                    analysis = await getPortfolioAnalysisWithCache();
                  } catch {
                    analysis = portfolioAnalysis;
                  }
                }
                const requestedSymbols = await getResolvedSymbols();
                const profilesBySymbol =
                  await getAssetProfilesBySymbols(requestedSymbols);
                const profileSymbols = Object.keys(profilesBySymbol);
                const topProfile = profileSymbols[0]
                  ? profilesBySymbol[profileSymbols[0]]
                  : undefined;

                assetFundamentalsSummary = this.buildAssetFundamentalsSummary({
                  portfolioAnalysis: analysis,
                  profilesBySymbol,
                  requestedSymbols,
                  userCurrency
                });

                return {
                  citations: [
                    {
                      confidence: 0.8,
                      snippet:
                        topProfile && profileSymbols[0]
                          ? `Fundamentals: ${profileSymbols[0]} ${topProfile.name ?? profileSymbols[0]} (${topProfile.assetClass ?? 'unknown_class'})`
                          : 'Fundamentals coverage is limited for requested symbols',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: { symbols: requestedSymbols },
                    outputSummary: `${profileSymbols.length}/${requestedSymbols.length} fundamentals resolved`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'get_financial_news') {
                const requestedSymbols = await getResolvedSymbols();
                const newsResult =
                  await getFinancialNewsBySymbols(requestedSymbols);
                const firstSymbol = newsResult.symbolsSearched[0];
                const firstHeadline = firstSymbol
                  ? newsResult.searchResultsBySymbol.get(firstSymbol)?.news
                      .results[0]
                  : undefined;
                const headlineCount = Array.from(
                  newsResult.searchResultsBySymbol.values()
                ).reduce((total, value) => {
                  return total + value.news.results.length;
                }, 0);

                financialNewsSummary =
                  newsResult.formattedSummary.length > 0
                    ? [
                        'News catalysts (latest):',
                        newsResult.formattedSummary,
                        'Use headlines as catalyst context and confirm with filings, earnings transcripts, and guidance changes before acting.'
                      ].join('\n')
                    : 'Financial news lookup returned no headlines for the requested symbols.';

                return {
                  citations: [
                    {
                      confidence: headlineCount > 0 ? 0.75 : 0.6,
                      snippet: firstHeadline
                        ? `${firstHeadline.title}`
                        : 'No financial headlines were returned',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: { symbols: requestedSymbols },
                    outputSummary: `${headlineCount} financial headlines resolved`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'get_recent_transactions') {
                const latestActivities = await getRecentActivities(5);

                recentTransactionsSummary =
                  latestActivities.length > 0
                    ? `Recent transactions: ${latestActivities
                        .map((activity) => {
                          const symbol =
                            activity.SymbolProfile?.symbol ??
                            activity.symbolProfileId;

                          return `${activity.type} ${symbol} ${activity.valueInBaseCurrency.toFixed(2)} ${userCurrency}`;
                        })
                        .join(' | ')}.`
                    : `I don't have any recorded transactions yet for this account.`;

                return {
                  citations: [
                    {
                      confidence: latestActivities.length > 0 ? 0.84 : 0.65,
                      snippet:
                        latestActivities.length > 0
                          ? `Latest transaction: ${latestActivities[0].type} ${latestActivities[0].SymbolProfile?.symbol ?? latestActivities[0].symbolProfileId} on ${new Date(latestActivities[0].date).toISOString().slice(0, 10)}`
                          : 'No recorded transactions found for this account',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: { take: 5 },
                    outputSummary: `${latestActivities.length} recent transactions returned`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'transaction_categorize') {
                const recentActivities = await getRecentActivities(50);
                const typeCounts = new Map<string, number>();
                const symbolCounts = new Map<string, number>();

                for (const activity of recentActivities) {
                  const type = String(activity.type ?? 'UNKNOWN').toUpperCase();
                  const symbol =
                    activity.SymbolProfile?.symbol ??
                    activity.symbolProfileId ??
                    'UNKNOWN';

                  typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
                  symbolCounts.set(symbol, (symbolCounts.get(symbol) ?? 0) + 1);
                }

                const typeBreakdown = Array.from(typeCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => `${type} ${count}`)
                  .join(', ');
                const activeSymbols = Array.from(symbolCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([symbol, count]) => `${symbol} ${count}`)
                  .join(', ');

                transactionCategorizationSummary =
                  recentActivities.length > 0
                    ? [
                        `Transaction categorization: ${recentActivities.length} recent transactions analyzed.`,
                        `Type breakdown: ${typeBreakdown || 'n/a'}.`,
                        `Most active symbols: ${activeSymbols || 'n/a'}.`
                      ].join('\n')
                    : 'Transaction categorization: no recent transactions available.';

                return {
                  citations: [
                    {
                      confidence: recentActivities.length > 0 ? 0.82 : 0.65,
                      snippet:
                        recentActivities.length > 0
                          ? `Transaction categories: ${typeBreakdown || 'n/a'}`
                          : 'No transactions available for categorization',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: { take: 50 },
                    outputSummary: `${recentActivities.length} transactions categorized`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'tax_estimate') {
                const taxInput = this.extractTaxEstimateInput(normalizedQuery);
                const income = Number.isFinite(taxInput.income)
                  ? taxInput.income
                  : 0;
                const deductions = Number.isFinite(taxInput.deductions)
                  ? taxInput.deductions
                  : 0;
                const taxableBase = Math.max(income - deductions, 0);
                const estimatedLiability = taxableBase * taxInput.taxRate;
                const hasAnyTaxInputs =
                  taxInput.hasIncome || taxInput.hasDeductions;

                taxEstimateSummary = hasAnyTaxInputs
                  ? [
                      `Tax estimate (assumption-based): income ${income.toFixed(2)} ${userCurrency}, deductions ${deductions.toFixed(2)} ${userCurrency}.`,
                      `Estimated taxable base: ${taxableBase.toFixed(2)} ${userCurrency}.`,
                      `Estimated tax liability at ${(taxInput.taxRate * 100).toFixed(1)}%: ${estimatedLiability.toFixed(2)} ${userCurrency}.`,
                      ...(!taxInput.hasIncome || !taxInput.hasDeductions
                        ? [
                            'Income or deductions were partially inferred from the prompt text.'
                          ]
                        : []),
                      'Assumptions: flat rate estimate for planning only; this is not filing-ready tax advice.'
                    ].join('\n')
                  : [
                      'Tax planning checklist for this year:',
                      '- Confirm expected ordinary income, capital gains, dividends, and interest totals.',
                      '- Review realized gains/losses and identify loss-harvesting opportunities before year-end.',
                      '- Verify contribution room and deadlines for tax-advantaged accounts.',
                      '- Track deductible items and required records for filing.',
                      '- Estimate withholding/quarterly payments and adjust to avoid penalties.',
                      'Share income, deductions, and expected rate if you want a numeric estimate.'
                    ].join('\n');

                return {
                  citations: [
                    {
                      confidence: hasAnyTaxInputs ? 0.74 : 0.7,
                      snippet: hasAnyTaxInputs
                        ? `Tax estimate: taxable base ${taxableBase.toFixed(2)} ${userCurrency}, liability ${estimatedLiability.toFixed(2)} ${userCurrency}`
                        : 'Tax planning checklist generated for current-year preparation',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: taxInput,
                    outputSummary: `estimated liability ${estimatedLiability.toFixed(2)} ${userCurrency}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'compliance_check') {
                const activities = await getRecentActivities(100);
                const complianceResult = this.runComplianceChecks({
                  activities
                });

                complianceCheckSummary = [
                  `Compliance check: ${complianceResult.violations.length} violations, ${complianceResult.warnings.length} warnings.`,
                  ...(complianceResult.violations.length > 0
                    ? [
                        `Violations: ${complianceResult.violations.join(' | ')}.`
                      ]
                    : []),
                  ...(complianceResult.warnings.length > 0
                    ? [`Warnings: ${complianceResult.warnings.join(' | ')}.`]
                    : [
                        'Warnings: no immediate rule flags detected from recent transactions.'
                      ]),
                  'Review account type, jurisdiction, and broker-specific constraints before execution.'
                ].join('\n');

                return {
                  citations: [
                    {
                      confidence:
                        complianceResult.violations.length > 0 ? 0.8 : 0.7,
                      snippet:
                        complianceResult.violations.length > 0
                          ? `Compliance violations: ${complianceResult.violations[0]}`
                          : `Compliance warnings: ${complianceResult.warnings[0] ?? 'none from recent transaction scan'}`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: { take: 100 },
                    outputSummary: `${complianceResult.violations.length} violations, ${complianceResult.warnings.length} warnings`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'rebalance_plan') {
                const analysis = await getPortfolioAnalysisWithCache();
                const currentRebalancePlan = runRebalancePlan({
                  portfolioAnalysis: analysis
                });
                rebalancePlan = currentRebalancePlan;
                const rebalanceSimulation = buildRebalancePlanSimulationSummary(
                  {
                    portfolioAnalysis: analysis,
                    rebalancePlan: currentRebalancePlan
                  }
                );
                rebalancePlanSummary = [
                  `Rebalance target ${(currentRebalancePlan.maxAllocationTarget * 100).toFixed(1)}%`,
                  `Before top: ${rebalanceSimulation.beforeTopSymbol} ${(rebalanceSimulation.beforeTopAllocation * 100).toFixed(2)}%`,
                  `After top: ${rebalanceSimulation.afterTopSymbol} ${(rebalanceSimulation.afterTopAllocation * 100).toFixed(2)}%`,
                  `HHI ${rebalanceSimulation.beforeHhi.toFixed(3)} -> ${rebalanceSimulation.afterHhi.toFixed(3)} (improvement ${(rebalanceSimulation.driftImprovement * 100).toFixed(2)}pp)`,
                  `Trades: ${rebalanceSimulation.tradeSummary}`
                ].join(' | ');

                return {
                  citations: [
                    {
                      confidence: 0.8,
                      snippet:
                        currentRebalancePlan.overweightHoldings.length > 0
                          ? `${currentRebalancePlan.overweightHoldings[0].symbol} exceeds target by ${(currentRebalancePlan.overweightHoldings[0].reductionNeeded * 100).toFixed(1)}pp`
                          : 'No overweight holdings above max allocation target',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {
                      maxAllocationTarget:
                        currentRebalancePlan.maxAllocationTarget
                    },
                    outputSummary: rebalancePlanSummary,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'stress_test') {
                const analysis = await getPortfolioAnalysisWithCache();
                const currentStressTest = runStressTest({
                  portfolioAnalysis: analysis
                });
                stressTest = currentStressTest;

                return {
                  citations: [
                    {
                      confidence: 0.8,
                      snippet: `${(currentStressTest.shockPercentage * 100).toFixed(0)}% shock drawdown ${currentStressTest.estimatedDrawdownInBaseCurrency.toFixed(2)} ${userCurrency}`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {
                      shockPercentage: currentStressTest.shockPercentage
                    },
                    outputSummary: `estimated drawdown ${currentStressTest.estimatedDrawdownInBaseCurrency.toFixed(2)} ${userCurrency}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'fire_analysis') {
                const analysis = await getPortfolioAnalysisWithCache();
                const currentRiskAssessment = runRiskAssessment({
                  portfolioAnalysis: analysis
                });
                const topHolding = analysis.holdings
                  .filter(({ valueInBaseCurrency }) => {
                    return valueInBaseCurrency > 0;
                  })
                  .sort((a, b) => {
                    return b.valueInBaseCurrency - a.valueInBaseCurrency;
                  })[0];
                const topAllocation =
                  topHolding && analysis.totalValueInBaseCurrency > 0
                    ? (topHolding.valueInBaseCurrency /
                        analysis.totalValueInBaseCurrency) *
                      100
                    : 0;
                const safeWithdrawal = analysis.totalValueInBaseCurrency * 0.04;
                const topSymbol = topHolding?.symbol ?? 'N/A';
                fireAnalysisSummary = buildFireAnalysisAnswer({
                  annualWithdrawal: safeWithdrawal,
                  holdingsCount: analysis.holdingsCount,
                  hhi: currentRiskAssessment.hhi,
                  topAllocation,
                  topSymbol,
                  totalValueInBaseCurrency: analysis.totalValueInBaseCurrency,
                  userCurrency
                });

                return {
                  citations: [
                    {
                      confidence: 0.78,
                      snippet: `FIRE analysis: ${analysis.holdingsCount} holdings, top allocation ${topAllocation.toFixed(2)}%, rule-of-thumb withdrawal ${safeWithdrawal.toFixed(2)} ${userCurrency}`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {
                      safeWithdrawalRatePercent: 4
                    },
                    outputSummary: `fire_analysis: holdings=${analysis.holdingsCount}, total=${analysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}, top=${topSymbol} ${topAllocation.toFixed(2)}%, hhi=${currentRiskAssessment.hhi.toFixed(3)}, withdrawal=${safeWithdrawal.toFixed(2)} ${userCurrency}/year`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'calculate_rebalance_plan') {
                const analysis = await getPortfolioAnalysis();
                const currentRebalancePlan = runRebalancePlan({
                  portfolioAnalysis: analysis
                });
                rebalancePlan = currentRebalancePlan;
                const rebalanceSimulation = buildRebalancePlanSimulationSummary(
                  {
                    portfolioAnalysis: analysis,
                    rebalancePlan: currentRebalancePlan
                  }
                );
                rebalancePlanSummary = [
                  `Rebalance simulation target ${(
                    currentRebalancePlan.maxAllocationTarget * 100
                  ).toFixed(1)}%`,
                  `Before top: ${rebalanceSimulation.beforeTopSymbol} ${(
                    rebalanceSimulation.beforeTopAllocation * 100
                  ).toFixed(2)}%`,
                  `After top: ${rebalanceSimulation.afterTopSymbol} ${(
                    rebalanceSimulation.afterTopAllocation * 100
                  ).toFixed(2)}%`,
                  `HHI ${rebalanceSimulation.beforeHhi.toFixed(3)} -> ${rebalanceSimulation.afterHhi.toFixed(3)} (improvement ${(rebalanceSimulation.driftImprovement * 100).toFixed(2)}pp)`,
                  `Trades: ${rebalanceSimulation.tradeSummary}`
                ].join(' | ');

                return {
                  citations: [
                    {
                      confidence: 0.82,
                      snippet:
                        currentRebalancePlan.overweightHoldings.length > 0
                          ? `Rebalance action: ${currentRebalancePlan.overweightHoldings[0].symbol} trim ${(currentRebalancePlan.overweightHoldings[0].reductionNeeded * 100).toFixed(1)}pp`
                          : 'Rebalance action: no holding exceeds target allocation',
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: {
                      maxAllocationTarget:
                        currentRebalancePlan.maxAllocationTarget
                    },
                    outputSummary: rebalancePlanSummary,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              } else if (toolName === 'simulate_trade_impact') {
                const analysis = await getPortfolioAnalysis();
                const tradeImpact = this.simulateTradeImpact({
                  portfolioAnalysis: analysis,
                  query: normalizedQuery
                });
                tradeImpactSummary = tradeImpact.summary;

                return {
                  citations: [
                    {
                      confidence: 0.8,
                      snippet: `Trade impact: ${tradeImpact.symbol} top allocation ${(tradeImpact.projectedAllocation * 100).toFixed(2)}% -> ${(tradeImpact.projectedTopAllocation * 100).toFixed(2)}%, HHI ${tradeImpact.projectedHhi.toFixed(3)}`,
                      source: toolName
                    }
                  ],
                  toolCall: {
                    input: { query: normalizedQuery },
                    outputSummary: `trade_impact for ${tradeImpact.symbol} from ${(tradeImpact.currentAllocation * 100).toFixed(2)}% to ${(tradeImpact.projectedAllocation * 100).toFixed(2)}%; top from ${(tradeImpact.topAllocationBefore * 100).toFixed(2)}% to ${(tradeImpact.projectedTopAllocation * 100).toFixed(2)}%, HHI ${tradeImpact.currentHhi.toFixed(3)} -> ${tradeImpact.projectedHhi.toFixed(3)}`,
                    status: 'success' as const,
                    tool: toolName
                  }
                };
              }

              return {
                citations: [],
                toolCall: {
                  input: {},
                  outputSummary: 'tool execution skipped',
                  status: 'failed' as const,
                  tool: toolName
                }
              };
            } catch (error) {
              return {
                citations: [],
                toolCall: {
                  input: {},
                  outputSummary:
                    error instanceof Error
                      ? error.message
                      : 'tool execution failed',
                  status: 'failed' as const,
                  tool: toolName
                }
              };
            }
          });
        })
      );
      toolExecutionInMs = Date.now() - toolExecutionStartedAt;

      for (const { citations: toolCitations, toolCall } of toolOutcomes) {
        toolCalls.push(toolCall);

        if (
          toolCall.status === 'success' &&
          ['seed_funds', 'create_order', 'create_account'].includes(
            toolCall.tool
          )
        ) {
          actionExecutionSummaries.push(
            `${toolCall.tool} executed: ${toolCall.outputSummary}`
          );
        }

        for (const citation of toolCitations) {
          citations.push(citation);
        }
      }

      addVerificationChecks({
        marketData,
        portfolioAnalysis,
        portfolioAnalysisExpected: policyDecision.toolsToExecute.some(
          (tool) => {
            return [
              'portfolio_analysis',
              'get_portfolio_summary',
              'get_current_holdings',
              'get_portfolio_risk_metrics',
              'rebalance_plan',
              'calculate_rebalance_plan',
              'stress_test',
              'simulate_trade_impact'
            ].includes(tool);
          }
        ),
        rebalancePlan,
        stressTest,
        toolCalls,
        verification
      });

      const policyVerificationDetails = formatPolicyVerificationDetails({
        policyDecision
      });
      verification.push({
        check: 'policy_gating',
        details: followUpSignal.isLikelyFollowUp
          ? `${policyVerificationDetails}; follow_up_signal=standalone:${followUpSignal.standaloneIntentConfidence.toFixed(
              2
            )},context:${followUpSignal.contextDependencyConfidence.toFixed(
              2
            )},continuity:${followUpSignal.topicContinuityConfidence.toFixed(2)}`
          : policyVerificationDetails,
        status:
          policyDecision.blockedByPolicy || policyDecision.route === 'clarify'
            ? 'warning'
            : 'passed'
      });

      let answer =
        policyDecision.route === 'tools'
          ? ''
          : createPolicyRouteResponse({
              followUpSignal,
              policyDecision,
              query: queryForTools
            });

      const historyFollowUpAnswer = resolveHistoryFollowUpResponse({
        previousTurn,
        query: queryForTools
      });
      if (historyFollowUpAnswer) {
        answer = historyFollowUpAnswer;
        verification.push({
          check: 'history_follow_up',
          details: 'Used previous assistant reply history to answer follow-up',
          status: 'passed'
        });
      }

      if (
        !historyFollowUpAnswer &&
        shouldUseLlmClarifyFallback({
          followUpSignal,
          policyDecision,
          previousTurn,
          query: queryForTools
        })
      ) {
        const recentTurns = memory.turns.slice(-2);
        const recentContext = recentTurns
          .map((turn, index) => {
            return [
              `Turn ${index + 1} user: ${turn.query}`,
              `Turn ${index + 1} assistant: ${turn.answer}`
            ].join('\n');
          })
          .join('\n');
        const arithmeticContext =
          isArithmeticLikeQuery(previousTurn?.query ?? '') ||
          isArithmeticLikeQuery(queryForTools);

        try {
          const clarifyReply = await this.generateText({
            model,
            prompt: [
              'You are Ghostfolio AI.',
              'Task: provide one short clarification question only.',
              'Use recent conversation context to interpret the follow-up.',
              'Do not provide portfolio advice, trades, or calculations.',
              arithmeticContext
                ? 'If context is arithmetic or math confusion, ask whether the user wants an explanation of the math result.'
                : 'Ask a context-appropriate follow-up question.',
              '',
              `Recent turns:\n${recentContext}`,
              '',
              `Latest user message: ${queryForTools}`
            ].join('\n'),
            signal: undefined
          });

          if (clarifyReply?.text?.trim()) {
            answer = clarifyReply.text.trim();
            verification.push({
              check: 'clarify_llm_fallback',
              details: 'Clarification question generated from recent history',
              status: 'passed'
            });
          }
        } catch {
          if (arithmeticContext) {
            answer = 'Do you want me to explain the math result?';
          }
          verification.push({
            check: 'clarify_llm_fallback',
            details:
              'LLM clarification fallback failed; default clarification response used',
            status: 'warning'
          });
        }
      }

      if (
        policyDecision.route === 'direct' &&
        policyDecision.blockReason === 'no_tool_query'
      ) {
        if (isPreferenceRecallQuery(queryForTools)) {
          answer = createPreferenceSummaryResponse({
            userPreferences: effectiveUserPreferences
          });
        } else if (preferenceUpdate.acknowledgement) {
          answer = preferenceUpdate.acknowledgement;
        }
      }

      if (policyDecision.route === 'tools') {
        const isSingleToolRoute = policyDecision.toolsToExecute.length === 1;
        const singleToolName = isSingleToolRoute
          ? policyDecision.toolsToExecute[0]
          : undefined;
        const singleToolDeterministicAnswer =
          singleToolName !== undefined
            ? buildSingleToolDeterministicAnswer({
                activityHistorySummary,
                demoDataSummary,
                assetFundamentalsSummary,
                financialNewsSummary,
                fireAnalysisSummary,
                marketData,
                portfolioAnalysis,
                priceHistorySummary,
                recentTransactionsSummary,
                rebalancePlanSummary,
                riskAssessment,
                stressTest,
                toolName: singleToolName,
                userCurrency
              })
            : undefined;
        const multiToolDeterministicAnswer =
          !singleToolDeterministicAnswer &&
          policyDecision.toolsToExecute.length > 1
            ? buildMultiToolDeterministicAnswer({
                portfolioAnalysis,
                rebalancePlanSummary,
                riskAssessment,
                toolsToExecute: policyDecision.toolsToExecute,
                userCurrency
              })
            : undefined;
        const isFireOnlyRoute =
          policyDecision.toolsToExecute.length === 1 &&
          policyDecision.toolsToExecute[0] === 'fire_analysis';

        const deterministicAnswer = isFireOnlyRoute
          ? fireAnalysisSummary
          : singleToolDeterministicAnswer ?? multiToolDeterministicAnswer;
        const shouldPreferDeterministicAnswer =
          !preferredStyleInstruction &&
          !effectiveUserPreferences.responseStyle &&
          !isRecommendationIntentQuery(queryForTools);
        const shouldUseDeterministicShortcut =
          shouldPreferDeterministicAnswer &&
          (isFireOnlyRoute || Boolean(singleToolDeterministicAnswer));

        if (
          shouldUseDeterministicShortcut &&
          deterministicAnswer?.trim().length
        ) {
          answer = deterministicAnswer;
        } else {
          const llmGenerationStartedAt = Date.now();
          answer = await buildAnswer({
              additionalContextSummaries: [
                ...actionExecutionSummaries,
                accountOverviewSummary,
                activityHistorySummary,
                benchmarkSummary,
                demoDataSummary,
                exchangeRateSummary,
                priceHistorySummary,
                symbolLookupSummary
              ].filter((summary): summary is string => Boolean(summary)),
              assetFundamentalsSummary,
              complianceCheckSummary,
              financialNewsSummary,
              generateText: (options) =>
                this.generateText({
                  ...options,
                  model,
                  useFormatterModel: true,
                  onLlmInvocation: ({ model: invocationModel, provider }) => {
                    llmInvocation = {
                      model: invocationModel,
                      provider
                    };
                  },
                  traceContext: {
                    query: queryForPrompt,
                    sessionId: resolvedSessionId,
                    traceId,
                    userId
                  }
                }),
            languageCode,
            marketData,
            memory,
            portfolioAnalysis,
            query: queryForPrompt,
            recentTransactionsSummary,
            fireAnalysisSummary,
            rebalancePlanSummary,
            rebalancePlan,
            riskAssessment,
            stressTest,
            taxEstimateSummary,
            tradeImpactSummary,
            transactionCategorizationSummary,
            userPreferences: effectiveUserPreferences,
            userCurrency
          });
          llmGenerationInMs = Date.now() - llmGenerationStartedAt;

          if (!answer?.trim() && deterministicAnswer?.trim().length) {
            answer = deterministicAnswer;
          }
        }
      }

      verification.push({
        check: 'output_completeness',
        details:
          answer.length > 0
            ? 'Answer generated successfully'
            : 'Answer content is empty',
        status: answer.length > 0 ? 'passed' : 'failed'
      });
      verification.push(
        evaluateAnswerQuality({
          answer,
          query: queryForTools
        })
      );

      verification.push({
        check: 'citation_coverage',
        details:
          citations.length >=
          toolCalls.filter(({ status }) => {
            return status === 'success';
          }).length
            ? 'Each successful tool call has at least one citation'
            : 'Citation coverage is incomplete',
        status:
          citations.length >=
          toolCalls.filter(({ status }) => {
            return status === 'success';
          }).length
            ? 'passed'
            : 'warning'
      });

      let confidence = calculateConfidence({
        toolCalls,
        verification
      });
      const isDirectNoToolResponse =
        policyDecision.route === 'direct' &&
        policyDecision.blockReason === 'no_tool_query' &&
        toolCalls.length === 0;
      const isDeterministicArithmeticResponse =
        isDirectNoToolResponse && /^\s*[-+*/().\d\s]+=\s*-?\d/.test(answer);

      if (isDeterministicArithmeticResponse) {
        confidence = {
          band: 'high',
          score: 0.95
        };
      } else if (isDirectNoToolResponse && confidence.band === 'low') {
        confidence = {
          band: 'medium',
          score: 0.72
        };
      }
      const successfulToolCalls = toolCalls.filter(({ status }) => {
        return status === 'success';
      }).length;
      const hasVerificationFailure = verification.some(({ status }) => {
        return status === 'failed';
      });
      let escalation: AiAgentChatResponse['escalation'] | undefined;

      if (
        confidence.band === 'low' &&
        successfulToolCalls === 0 &&
        policyDecision.route === 'tools' &&
        policyDecision.blockReason !== 'unauthorized_access'
      ) {
        answer = [
          'Insufficient confidence to answer safely with the current evidence.',
          'I need one concrete request with scope (portfolio, symbol, tax, or FIRE) before I proceed.',
          'Once provided, I will return a verified answer with confidence and citations.'
        ].join(' ');
        verification.push({
          check: 'confidence_guardrail',
          details:
            'Low confidence with no successful tool evidence; abstain response returned',
          status: 'warning'
        });
      }

      if (
        hasVerificationFailure ||
        (confidence.band === 'low' &&
          successfulToolCalls === 0 &&
          policyDecision.route === 'tools')
      ) {
        escalation = {
          reason: hasVerificationFailure
            ? 'Verification checks reported failed status'
            : 'Low confidence with insufficient reliable tool evidence',
          required: true,
          suggestedAction:
            'Escalate this response to a human reviewer before taking financial action.'
        };
        verification.push({
          check: 'human_in_the_loop',
          details:
            'Escalation trigger activated for human review before execution',
          status: 'warning'
        });

        if (!/Escalation:/i.test(answer)) {
          answer = `${answer} Escalation: route to human review before acting on this output.`;
        }
      }

      const updatedMemoryTurns = [
        ...memory.turns,
        {
          answer,
          context: buildTurnContext({
            query: queryForTools,
            toolCalls
          }),
          query: normalizedQuery,
          timestamp: new Date().toISOString(),
          toolCalls: toolCalls.map(({ status, tool }) => {
            return {
              status,
              tool
            };
          })
        }
      ].slice(-AI_AGENT_MEMORY_MAX_TURNS);

      const memoryWriteStartedAt = Date.now();
      await setMemory({
        memory: {
          turns: updatedMemoryTurns
        },
        redisCacheService: this.redisCacheService,
        sessionId: resolvedSessionId,
        userId
      });
      if (preferenceUpdate.shouldPersist) {
        await setUserPreferences({
          redisCacheService: this.redisCacheService,
          userId,
          userPreferences: effectiveUserPreferences
        });
      }
      memoryWriteInMs = Date.now() - memoryWriteStartedAt;

      if (responseCacheKey && answer.length > 0 && confidence.band !== 'low') {
        try {
          await this.redisCacheService.set(
            responseCacheKey,
            JSON.stringify({
              answer
            } satisfies CachedResponsePayload),
            AI_RESPONSE_CACHE_TTL_IN_MS
          );
        } catch {}
      }

      const response: AiAgentChatResponse = {
        answer,
        citations,
        llmInvocation,
        confidence,
        escalation,
        memory: {
          sessionId: resolvedSessionId,
          turns: updatedMemoryTurns.length
        },
        toolCalls,
        verification
      };

      response.observability =
        await this.aiObservabilityService.captureChatSuccess({
          durationInMs: Date.now() - chatStartedAt,
          latencyBreakdownInMs: {
            llmGenerationInMs,
            memoryReadInMs,
            memoryWriteInMs,
            toolExecutionInMs
          },
          policy: {
            blockReason: policyDecision.blockReason,
            blockedByPolicy: policyDecision.blockedByPolicy,
            forcedDirect: policyDecision.forcedDirect,
            plannedTools: policyDecision.plannedTools,
            route: policyDecision.route,
            toolsToExecute: policyDecision.toolsToExecute
          },
          query: queryForTools,
          response,
          sessionId: resolvedSessionId,
          userId,
          traceId
        });

      return response;
    } catch (error) {
      await this.aiObservabilityService.captureChatFailure({
        durationInMs: Date.now() - chatStartedAt,
        error,
        query: queryForTools,
        sessionId: resolvedSessionId,
        userId,
        traceId
      });

      throw error;
    }
  }

  public async getPrompt({
    filters,
    impersonationId,
    languageCode,
    mode,
    userCurrency,
    userId
  }: {
    filters?: Filter[];
    impersonationId: string;
    languageCode: string;
    mode: AiPromptMode;
    userCurrency: string;
    userId: string;
  }) {
    const { holdings } = await this.portfolioService.getDetails({
      filters,
      impersonationId,
      userId
    });

    return createHoldingsPrompt({
      holdings,
      languageCode,
      mode,
      userCurrency
    });
  }

  private extractTaxEstimateInput(query: string) {
    const normalized = query.toLowerCase();
    const numericPattern = /\$?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/g;
    const numericTokens: number[] = [];
    let numericMatch: RegExpExecArray | null = null;

    while ((numericMatch = numericPattern.exec(normalized)) !== null) {
      const rawValue = numericMatch[1];
      const parsedValue = Number.parseFloat(rawValue.replace(/,/g, ''));
      const matchStart = numericMatch.index;
      const matchEnd = matchStart + numericMatch[0].length;
      const trailingSegment = normalized.slice(matchEnd, matchEnd + 3);
      const isPercentage = /^\s*%/.test(trailingSegment);

      if (Number.isFinite(parsedValue) && !isPercentage) {
        numericTokens.push(parsedValue);
      }
    }

    const incomePattern =
      /\b(?:income|salary|earnings?)\b[^\d$]*\$?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/i;
    const deductionsPattern =
      /\b(?:deduction|deductions|deductible|write[-\s]?off)\b[^\d$]*\$?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/i;
    const taxRatePattern =
      /\b(?:tax\s*rate|rate)\b[^\d]*([0-9]{1,2}(?:\.[0-9]+)?)\s*%/i;
    const hasIncomeKeyword = incomePattern.test(normalized);
    const hasDeductionsKeyword = deductionsPattern.test(normalized);
    const incomeMatch = hasIncomeKeyword
      ? incomePattern.exec(normalized)
      : null;
    const deductionsMatch = hasDeductionsKeyword
      ? deductionsPattern.exec(normalized)
      : null;
    const taxRateMatch = taxRatePattern.exec(normalized);

    const parsedIncome = hasIncomeKeyword
      ? Number.parseFloat((incomeMatch?.[1] ?? '').replace(/,/g, ''))
      : hasDeductionsKeyword
        ? undefined
        : numericTokens[0];
    const parsedDeductions = hasDeductionsKeyword
      ? Number.parseFloat((deductionsMatch?.[1] ?? '').replace(/,/g, ''))
      : hasIncomeKeyword
        ? undefined
        : numericTokens[1];
    const parsedTaxRate = taxRateMatch
      ? Number.parseFloat(taxRateMatch[1]) / 100
      : undefined;

    return {
      deductions: Number.isFinite(parsedDeductions)
        ? parsedDeductions
        : undefined,
      hasDeductions: Number.isFinite(parsedDeductions),
      hasIncome: Number.isFinite(parsedIncome),
      income: Number.isFinite(parsedIncome) ? parsedIncome : undefined,
      taxRate:
        Number.isFinite(parsedTaxRate) && parsedTaxRate > 0 && parsedTaxRate < 1
          ? parsedTaxRate
          : 0.22
    };
  }

  private extractExchangeRateInput({
    baseCurrency,
    query
  }: {
    baseCurrency: string;
    query: string;
  }) {
    const normalizedQuery = query.toUpperCase();
    const pairMatch = /\b([A-Z]{3})\s+(?:TO|\/)\s+([A-Z]{3})\b/.exec(
      normalizedQuery
    );
    const explicitCodes = normalizedQuery.match(/\b[A-Z]{3}\b/g) ?? [];
    const from = pairMatch?.[1] ?? explicitCodes[0] ?? baseCurrency;
    const to = pairMatch?.[2] ?? explicitCodes[1] ?? 'USD';

    return {
      from,
      to
    };
  }

  private extractCreateAccountInput({
    baseCurrency,
    query
  }: {
    baseCurrency: string;
    query: string;
  }) {
    const nameMatch =
      /(?:account(?:\s+named)?|create\s+account)\s+([a-z0-9 _-]{2,40})/i.exec(
        query
      );
    const currencyMatch = /\b([A-Z]{3})\b/.exec(query.toUpperCase());
    const balanceMatch = /\b(?:with|balance)\s+\$?([0-9]+(?:\.[0-9]+)?)/i.exec(
      query
    );

    return {
      balance: Number.parseFloat(balanceMatch?.[1] ?? '0'),
      currency: currencyMatch?.[1] ?? baseCurrency,
      name: nameMatch?.[1]?.trim() || 'AI Account'
    };
  }

  private extractSeedFundsInput({
    baseCurrency,
    query
  }: {
    baseCurrency: string;
    query: string;
  }) {
    const normalizedQuery = query.toUpperCase();
    const amountMatch = /\$?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/.exec(
      normalizedQuery
    );
    const currencyAfterAmountMatch = /\$?\d+(?:,\d{3})*(?:\.\d{1,2})?\s*([A-Z]{3})\b/.exec(
      normalizedQuery
    );
    const currencyBeforeAmountMatch = /\b([A-Z]{3})\s+\$?\d+(?:,\d{3})*(?:\.\d{1,2})?\b/.exec(
      normalizedQuery
    );

    const currency =
      currencyAfterAmountMatch?.[1] ??
      currencyBeforeAmountMatch?.[1] ??
      baseCurrency;

    return {
      amount: Number.parseFloat((amountMatch?.[1] ?? '0').replace(/,/g, '')),
      currency,
      hasAmount: Boolean(amountMatch?.[1])
    };
  }

  private extractCreateOrderInput({
    baseCurrency,
    query
  }: {
    baseCurrency: string;
    query: string;
  }) {
    const symbols = extractSymbolsFromQuery(query);
    const quantityMatch =
      /\b([0-9]+(?:\.[0-9]+)?)\s*(?:shares?|units?)\b/i.exec(query);
    const unitPriceMatch = /\b(?:at|price)\s+\$?([0-9]+(?:\.[0-9]+)?)\b/i.exec(
      query
    );
    const currencyMatch = /\b([A-Z]{3})\b/.exec(query.toUpperCase());
    const normalizedQuery = query.toLowerCase();

    return {
      currency: currencyMatch?.[1] ?? baseCurrency,
      hasQuantity: Boolean(quantityMatch?.[1]),
      hasSymbol: symbols.length > 0,
      hasUnitPrice: Boolean(unitPriceMatch?.[1]),
      quantity: Number.parseFloat(quantityMatch?.[1] ?? '1'),
      symbol: symbols[0] ?? 'SPY',
      type: normalizedQuery.includes('sell') ? Type.SELL : Type.BUY,
      unitPrice: Number.parseFloat(unitPriceMatch?.[1] ?? '1')
    };
  }

  private runComplianceChecks({
    activities
  }: {
    activities: {
      date: Date | string;
      symbolProfileId?: string;
      SymbolProfile?: { symbol?: string };
      type: string;
    }[];
  }) {
    const violations: string[] = [];
    const warnings: string[] = [];
    const buysBySymbol = new Map<string, Date[]>();
    const sellsBySymbol = new Map<string, Date[]>();
    const tradesBySymbol = new Map<string, number>();

    for (const activity of activities) {
      const symbol =
        activity.SymbolProfile?.symbol ?? activity.symbolProfileId ?? 'UNKNOWN';
      const type = String(activity.type ?? '').toUpperCase();
      const tradeDate = new Date(activity.date);

      if (Number.isNaN(tradeDate.getTime())) {
        continue;
      }

      tradesBySymbol.set(symbol, (tradesBySymbol.get(symbol) ?? 0) + 1);

      if (type.includes('BUY')) {
        buysBySymbol.set(symbol, [
          ...(buysBySymbol.get(symbol) ?? []),
          tradeDate
        ]);
      } else if (type.includes('SELL')) {
        sellsBySymbol.set(symbol, [
          ...(sellsBySymbol.get(symbol) ?? []),
          tradeDate
        ]);
      }
    }

    for (const [symbol, sellDates] of sellsBySymbol.entries()) {
      const buyDates = buysBySymbol.get(symbol) ?? [];
      const hasPotentialWashSale = sellDates.some((sellDate) => {
        return buyDates.some((buyDate) => {
          const diffInMs = Math.abs(sellDate.getTime() - buyDate.getTime());

          return diffInMs <= 30 * 24 * 60 * 60 * 1000;
        });
      });

      if (hasPotentialWashSale) {
        warnings.push(
          `${symbol} has buy/sell activity within 30 days (potential wash-sale review needed)`
        );
      }
    }

    for (const [symbol, count] of tradesBySymbol.entries()) {
      if (count >= 15) {
        warnings.push(`${symbol} shows elevated turnover (${count} trades)`);
      }
    }

    if (activities.length >= 80) {
      warnings.push(
        `High aggregate trade volume detected (${activities.length} recent transactions)`
      );
    }

    if (warnings.length >= 5) {
      violations.push('Multiple concurrent compliance-risk signals detected');
    }

    return {
      violations,
      warnings
    };
  }

  private extractSymbolIdentifiersFromPortfolio({
    portfolioAnalysis,
    symbols
  }: {
    portfolioAnalysis?: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
    symbols: string[];
  }) {
    const dataSourceBySymbol = new Map(
      (portfolioAnalysis?.holdings ?? []).map(({ dataSource, symbol }) => {
        return [symbol, dataSource];
      })
    );

    return Array.from(
      new Set(
        symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
      )
    ).map((symbol) => {
      return {
        dataSource: dataSourceBySymbol.get(symbol) ?? DataSource.YAHOO,
        symbol
      };
    });
  }

  private buildAssetFundamentalsSummary({
    portfolioAnalysis,
    profilesBySymbol,
    requestedSymbols,
    userCurrency
  }: {
    portfolioAnalysis?: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
    profilesBySymbol: Record<string, Partial<SymbolProfile>>;
    requestedSymbols: string[];
    userCurrency: string;
  }) {
    const resolvedSymbols = Object.keys(profilesBySymbol);

    if (resolvedSymbols.length === 0) {
      return 'Fundamentals request completed with limited profile coverage.';
    }

    const sections: string[] = ['Fundamental analysis:'];

    for (const symbol of resolvedSymbols.slice(0, 3)) {
      const profile = profilesBySymbol[symbol];
      const name = profile?.name?.trim() || symbol;
      const assetClass = profile?.assetClass?.toString() ?? 'unknown_class';
      const sectorMix = this.formatWeightedDistribution({
        entries: profile?.sectors,
        fallback: 'n/a',
        labelKeys: ['name', 'sector']
      });
      const countryMix = this.formatWeightedDistribution({
        entries: profile?.countries,
        fallback: 'n/a',
        labelKeys: ['code', 'country', 'name']
      });
      const topHoldings = this.formatWeightedDistribution({
        entries: profile?.holdings,
        fallback: 'n/a',
        labelKeys: ['symbol', 'holding', 'name']
      });
      const matchingPortfolioHolding = portfolioAnalysis?.holdings.find(
        (holding) => {
          return holding.symbol === symbol;
        }
      );

      sections.push(`${symbol} — ${name} (${assetClass})`);
      sections.push(`Sectors: ${sectorMix}`);
      sections.push(`Countries: ${countryMix}`);

      if (topHoldings !== 'n/a') {
        sections.push(`Top holdings (if fund/ETF): ${topHoldings}`);
      }

      if (
        matchingPortfolioHolding &&
        portfolioAnalysis.totalValueInBaseCurrency > 0
      ) {
        const allocation = (
          (matchingPortfolioHolding.valueInBaseCurrency /
            portfolioAnalysis.totalValueInBaseCurrency) *
          100
        ).toFixed(1);

        sections.push(
          `Portfolio exposure: ${allocation}% (${matchingPortfolioHolding.valueInBaseCurrency.toFixed(2)} ${userCurrency}).`
        );
      } else {
        sections.push(
          'Portfolio exposure: not currently held in your portfolio snapshot.'
        );
      }
    }

    const unresolvedSymbols = requestedSymbols.filter((requestedSymbol) => {
      return !resolvedSymbols.includes(requestedSymbol);
    });

    if (unresolvedSymbols.length > 0) {
      sections.push(
        `Coverage note: no fundamentals profile returned for ${unresolvedSymbols.join(', ')}.`
      );
    }

    sections.push(
      'Decision use: combine profile context with valuation metrics, catalysts, and your position-size limits before taking action.'
    );

    return sections.join('\n');
  }

  private formatWeightedDistribution({
    entries,
    fallback,
    labelKeys
  }: {
    entries: unknown;
    fallback: string;
    labelKeys: string[];
  }) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return fallback;
    }

    const normalized = entries.reduce<{ label: string; weight?: number }[]>(
      (accumulator, entry) => {
        if (!entry || typeof entry !== 'object') {
          return accumulator;
        }

        const record = entry as Record<string, unknown>;
        const label = this.resolveDistributionLabel({
          labelKeys,
          record
        });

        if (!label) {
          return accumulator;
        }

        const weight = this.resolveDistributionWeightInPercent(record.weight);

        accumulator.push({
          label,
          weight
        });

        return accumulator;
      },
      []
    );

    if (normalized.length === 0) {
      return fallback;
    }

    return normalized
      .slice(0, 3)
      .map(({ label, weight }) => {
        return typeof weight === 'number'
          ? `${label} ${weight.toFixed(1)}%`
          : label;
      })
      .join(', ');
  }

  private resolveDistributionLabel({
    labelKeys,
    record
  }: {
    labelKeys: string[];
    record: Record<string, unknown>;
  }) {
    for (const key of labelKeys) {
      const value = record[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private resolveDistributionWeightInPercent(weight: unknown) {
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      return undefined;
    }

    if (weight <= 1) {
      return weight * 100;
    }

    return weight;
  }

  private simulateTradeImpact({
    portfolioAnalysis,
    query
  }: {
    portfolioAnalysis: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
    query: string;
  }): {
    currentAllocation: number;
    currentHhi: number;
    projectedAllocation: number;
    projectedHhi: number;
    topAllocationBefore: number;
    projectedTopAllocation: number;
    summary: string;
    symbol: string;
  } {
    const buyMatch =
      /\b(?:buy|invest|add)\s+\$?(\d+(?:\.\d+)?)\s*(?:usd|dollars?)?(?:\s+(?:of|into))?\s*([a-z]{1,6})?\b/i.exec(
        query
      );
    const sellMatch =
      /\b(?:sell|trim)\s+\$?(\d+(?:\.\d+)?)\s*(?:usd|dollars?)?(?:\s+(?:of|from))?\s*([a-z]{1,6})?\b/i.exec(
        query
      );
    const defaultSymbol = portfolioAnalysis.holdings[0]?.symbol ?? 'CASH';
    const action = sellMatch ? 'sell' : 'buy';
    const amount = Number.parseFloat(sellMatch?.[1] ?? buyMatch?.[1] ?? '1000');
    const symbol = (
      sellMatch?.[2] ??
      buyMatch?.[2] ??
      defaultSymbol
    ).toUpperCase();
    const signedAmount = action === 'sell' ? -amount : amount;
    const holdingsBySymbol = new Map<string, number>(
      portfolioAnalysis.holdings.map((holding) => {
        return [holding.symbol, Math.max(holding.valueInBaseCurrency, 0)];
      })
    );
    const currentTotalValue = Math.max(
      portfolioAnalysis.totalValueInBaseCurrency,
      Number.EPSILON
    );
    const longHoldings = portfolioAnalysis.holdings
      .map(({ symbol: holdingSymbol, valueInBaseCurrency }) => {
        return {
          symbol: holdingSymbol,
          valueInBaseCurrency: Math.max(valueInBaseCurrency, 0)
        };
      })
      .filter(({ valueInBaseCurrency }) => {
        return valueInBaseCurrency > 0;
      });
    const currentLongTotalValue = Math.max(
      longHoldings.reduce((total, { valueInBaseCurrency }) => {
        return total + valueInBaseCurrency;
      }, 0),
      Number.EPSILON
    );
    const currentTopHolding = [...longHoldings].sort((a, b) => {
      return b.valueInBaseCurrency - a.valueInBaseCurrency;
    })[0];
    const currentTopAllocation = currentTopHolding
      ? currentTopHolding.valueInBaseCurrency / currentLongTotalValue
      : 0;
    const currentAllocation =
      (holdingsBySymbol.get(symbol) ?? 0) / currentTotalValue;
    const currentHhi = calculateHhi({
      holdings: longHoldings,
      totalValue: currentLongTotalValue
    });
    const projectedBySymbol = new Map<string, number>(
      longHoldings.map(({ symbol: holdingSymbol, valueInBaseCurrency }) => {
        return [holdingSymbol, valueInBaseCurrency];
      })
    );
    const projectedSymbolValue = Math.max(
      (projectedBySymbol.get(symbol) ?? 0) + signedAmount,
      0
    );
    projectedBySymbol.set(symbol, projectedSymbolValue);

    const projectedLongTotalValue = Math.max(
      Array.from(projectedBySymbol.values()).reduce((total, value) => {
        return total + value;
      }, 0),
      Number.EPSILON
    );
    const projectedAllocation = projectedSymbolValue / projectedLongTotalValue;
    const topProjectedHolding = Array.from(projectedBySymbol.entries()).sort(
      (a, b) => {
        return b[1] - a[1];
      }
    )[0];
    const topProjectedAllocation = topProjectedHolding
      ? topProjectedHolding[1] / projectedLongTotalValue
      : 0;
    const projectedHhi = calculateHhi({
      holdings: Array.from(projectedBySymbol.entries()).map(
        ([holdingSymbol, valueInBaseCurrency]) => {
          return {
            symbol: holdingSymbol,
            valueInBaseCurrency
          };
        }
      ),
      totalValue: projectedLongTotalValue
    });

    return {
      currentAllocation,
      currentHhi,
      projectedAllocation,
      topAllocationBefore: currentTopAllocation,
      projectedTopAllocation: topProjectedAllocation,
      projectedHhi,
      summary: `Trade impact simulation: ${action} ${amount.toFixed(2)} ${symbol} moves ${symbol} allocation from ${(currentAllocation * 100).toFixed(2)}% to ${(projectedAllocation * 100).toFixed(2)}%, top allocation from ${(currentTopAllocation * 100).toFixed(2)}% to ${(topProjectedAllocation * 100).toFixed(2)}%, HHI ${(currentHhi || 0).toFixed(3)} -> ${(projectedHhi || 0).toFixed(3)}.`,
      symbol
    };
  }
}
