import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import {
  PROPERTY_API_KEY_OPENROUTER,
  PROPERTY_OPENROUTER_MODEL
} from '@ghostfolio/common/config';
import { Filter } from '@ghostfolio/common/interfaces';
import type { AiPromptMode } from '@ghostfolio/common/types';
import { Injectable } from '@nestjs/common';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { DataSource } from '@prisma/client';
import type { SymbolProfile } from '@prisma/client';
import { RunnableLambda } from '@langchain/core/runnables';
import { generateText } from 'ai';
import { randomUUID } from 'node:crypto';
import {
  AiAgentChatMessage,
  AiAgentChatResponse,
  AiAgentToolName,
  AiAgentToolCall
} from './ai-agent.interfaces';
import {
  AI_AGENT_MEMORY_MAX_TURNS,
  buildAnswer,
  createPreferenceSummaryResponse,
  getMemory,
  getUserPreferences,
  isPreferenceRecallQuery,
  resolvePreferenceUpdate,
  resolveSymbols,
  runMarketDataLookup,
  runPortfolioAnalysis,
  runRiskAssessment,
  setMemory,
  setUserPreferences
} from './ai-agent.chat.helpers';
import { addVerificationChecks } from './ai-agent.verification.helpers';
import {
  runRebalancePlan,
  runStressTest
} from './ai-agent.scenario.helpers';
import { createHoldingsPrompt } from './ai-agent.prompt.helpers';
import {
  generateTextWithMinimax,
  generateTextWithZAiGlm
} from './ai-llm.providers';
import { AiObservabilityService } from './ai-observability.service';
import {
  calculateConfidence,
  determineToolPlan,
  evaluateAnswerQuality
} from './ai-agent.utils';
import {
  applyToolExecutionPolicy,
  createPolicyRouteResponse,
  formatPolicyVerificationDetails,
  isFollowUpQuery
} from './ai-agent.policy.utils';

const PORTFOLIO_CONTEXT_SYMBOL_TOOLS = new Set([
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
const ORDER_TOOL_TAKE_BY_NAME: Partial<Record<AiAgentToolName, number>> = {
  get_recent_transactions: 5,
  transaction_categorize: 50,
  compliance_check: 100
};
type OrderActivity = Awaited<
  ReturnType<OrderService['getOrders']>
>['activities'][number];

@Injectable()
export class AiService {
  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly orderService: OrderService,
    private readonly portfolioService: PortfolioService,
    private readonly propertyService: PropertyService,
    private readonly redisCacheService: RedisCacheService,
    private readonly aiObservabilityService: AiObservabilityService
  ) {}
  public async generateText({
    messages,
    prompt,
    signal,
    model,
    traceContext
  }: {
    messages?: AiAgentChatMessage[];
    prompt?: string;
    signal?: AbortSignal;
    model?: string;
    traceContext?: {
      query?: string;
      sessionId?: string;
      userId?: string;
    };
  }) {
    const filteredMessages = messages?.filter(({ content }) => {
      return typeof content === 'string' && content.trim().length > 0;
    });
    const promptFromMessages =
      filteredMessages && filteredMessages.length > 0
        ? filteredMessages
            .map(({ content, role }) => {
              return `${role}: ${content}`;
            })
            .join('\n\n')
        : '';
    const resolvedPrompt = prompt?.trim() || promptFromMessages;

    if (!resolvedPrompt) {
      throw new Error('prompt or messages are required for LLM generation');
    }

    const zAiGlmApiKey =
      process.env.z_ai_glm_api_key ?? process.env.Z_AI_GLM_API_KEY;
    const zAiGlmModel = process.env.z_ai_glm_model ?? process.env.Z_AI_GLM_MODEL;
    const minimaxApiKey =
      process.env.minimax_api_key ?? process.env.MINIMAX_API_KEY;
    const minimaxModel = process.env.minimax_model ?? process.env.MINIMAX_MODEL;
    const normalizedModel = (model ?? 'auto').toLowerCase();
    const requestedModel = ['auto', 'glm', 'minimax'].includes(normalizedModel)
      ? normalizedModel
      : 'auto';
    const shouldTryGlm = requestedModel === 'auto' || requestedModel === 'glm';
    const shouldTryMinimax =
      requestedModel === 'auto' || requestedModel === 'minimax';
    const providerUnavailable = (provider: string) =>
      `${provider}: not configured`;
    const providerErrors: string[] = [];
    const invokeProviderWithTracing = async ({
      model,
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
          userId
        }: {
          model: string;
          prompt: string;
          provider: string;
          query?: string;
          sessionId?: string;
          userId?: string;
          messages?: AiAgentChatMessage[];
        }) => {
          const startedAt = Date.now();
          let invocationError: unknown;
          let responseText: string | undefined;

          try {
            const response = await run();
            responseText = response?.text;

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
              userId
            });
          }
        }
      );

      return invocationRunnable.invoke(
        {
          model,
          prompt: resolvedPrompt,
          provider,
          query: traceContext?.query,
          sessionId: traceContext?.sessionId,
          userId: traceContext?.userId,
          messages: filteredMessages
        },
        {
          metadata: {
            model,
            provider,
            query: traceContext?.query ?? '',
            sessionId: traceContext?.sessionId ?? '',
            userId: traceContext?.userId ?? ''
          },
          runName: `ghostfolio_ai_llm_${provider}`,
          tags: ['ghostfolio-ai', 'llm-invocation', provider]
        }
      );
    };

    if (shouldTryGlm) {
      if (!zAiGlmApiKey) {
        if (requestedModel === 'glm') {
          providerErrors.push(providerUnavailable('z_ai_glm'));
        }
      } else {
        try {
          return await invokeProviderWithTracing({
            model: zAiGlmModel ?? 'glm-5',
            provider: 'z_ai_glm',
            run: () =>
              generateTextWithZAiGlm({
                apiKey: zAiGlmApiKey,
                model: zAiGlmModel,
                messages: filteredMessages,
                prompt: resolvedPrompt,
                signal
              })
          });
        } catch (error) {
          providerErrors.push(
            `z_ai_glm: ${error instanceof Error ? error.message : 'request failed'}`
          );
        }
      }
    }

    if (shouldTryMinimax) {
      if (!minimaxApiKey) {
        if (requestedModel === 'minimax') {
          providerErrors.push(providerUnavailable('minimax'));
        }
      } else {
        try {
          return await invokeProviderWithTracing({
            model: minimaxModel ?? 'MiniMax-M2.5',
            provider: 'minimax',
            run: () =>
              generateTextWithMinimax({
                apiKey: minimaxApiKey,
                model: minimaxModel,
                messages: filteredMessages,
                prompt: resolvedPrompt,
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

    const openRouterApiKey = await this.propertyService.getByKey<string>(
      PROPERTY_API_KEY_OPENROUTER
    );
    const openRouterModel = await this.propertyService.getByKey<string>(
      PROPERTY_OPENROUTER_MODEL
    );
    if (!openRouterApiKey || !openRouterModel) {
      throw new Error(
        providerErrors.length > 0
          ? `No AI provider configured (${providerErrors.join('; ')})`
          : 'OpenRouter is not configured'
      );
    }

    const openRouterService = createOpenRouter({
      apiKey: openRouterApiKey
    });
    return invokeProviderWithTracing({
      model: openRouterModel,
      provider: 'openrouter',
      run: async () => {
        if (filteredMessages && filteredMessages.length > 0) {
          return generateText({
            abortSignal: signal,
            messages: filteredMessages.map(({ content, role }) => {
              return { content, role };
            }),
            model: openRouterService.chat(openRouterModel)
          });
        }

        return generateText({
          abortSignal: signal,
          model: openRouterService.chat(openRouterModel),
          prompt: resolvedPrompt
        });
      }
    });
  }

  public async chat({
    languageCode,
    query,
    sessionId,
    symbols,
    model,
    userCurrency,
    userId
  }: {
    languageCode: string;
    query: string;
    sessionId?: string;
    symbols?: string[];
    model?: string;
    userCurrency: string;
    userId: string;
  }): Promise<AiAgentChatResponse> {
    const normalizedQuery = query.trim();
    const resolvedSessionId = sessionId?.trim() || randomUUID();
    const chatStartedAt = Date.now();
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
        query: normalizedQuery,
        symbols
      });
      const previousTurn =
        memory.turns.length > 0 ? memory.turns[memory.turns.length - 1] : undefined;
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
      const plannedTools =
        inferredPlannedTools.length === 0 &&
        isFollowUpQuery(normalizedQuery) &&
        previousSuccessfulTools.length > 0
          ? previousSuccessfulTools
          : inferredPlannedTools;
      const policyDecision = applyToolExecutionPolicy({
        plannedTools,
        query: normalizedQuery
      });
      const preferenceUpdate = resolvePreferenceUpdate({
        query: normalizedQuery,
        userPreferences
      });
      const effectiveUserPreferences = preferenceUpdate.userPreferences;
      const toolCalls: AiAgentToolCall[] = [];
      const citations: AiAgentChatResponse['citations'] = [];
      const verification: AiAgentChatResponse['verification'] = [];
      let portfolioAnalysis: Awaited<ReturnType<typeof runPortfolioAnalysis>>;
      let riskAssessment: ReturnType<typeof runRiskAssessment>;
      let marketData: Awaited<ReturnType<typeof runMarketDataLookup>>;
      let rebalancePlan: ReturnType<typeof runRebalancePlan>;
      let stressTest: ReturnType<typeof runStressTest>;
      let assetFundamentalsSummary: string | undefined;
      let complianceCheckSummary: string | undefined;
      let financialNewsSummary: string | undefined;
      let recentTransactionsSummary: string | undefined;
      let taxEstimateSummary: string | undefined;
      let tradeImpactSummary: string | undefined;
      let transactionCategorizationSummary: string | undefined;

      const shouldUsePortfolioContextForSymbols =
        policyDecision.toolsToExecute.some((toolName) => {
          return PORTFOLIO_CONTEXT_SYMBOL_TOOLS.has(toolName);
        });
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
        Promise<{ link: string; symbol: string; title: string }[]>
      >();

      const getPortfolioAnalysis = () => {
        if (!portfolioAnalysisPromise) {
          portfolioAnalysisPromise = runPortfolioAnalysis({
            portfolioService: this.portfolioService,
            userId
          }).then((analysis) => {
            portfolioAnalysis = analysis;

            return analysis;
          });
        }

        return portfolioAnalysisPromise;
      };

      const getResolvedSymbols = async () => {
        if (!resolvedSymbolsPromise) {
          resolvedSymbolsPromise = (async () => {
            const analysisForResolution = shouldUsePortfolioContextForSymbols
              ? await getPortfolioAnalysis()
              : portfolioAnalysis;

            return resolveSymbols({
              portfolioAnalysis: analysisForResolution,
              query: normalizedQuery,
              symbols
            });
          })();
        }

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
              const lookup = await runMarketDataLookup({
                dataProviderService: this.dataProviderService,
                portfolioAnalysis: analysisForMarketData,
                symbols: requestedSymbols
              });
              marketData = lookup;

              return lookup;
            })()
          );
        }

        const lookup = await marketDataBySymbolsCache.get(cacheKey)!;
        marketData = lookup;

        return lookup;
      };

      const getAssetProfilesBySymbols = async (requestedSymbols: string[]) => {
        if (requestedSymbols.length === 0) {
          return {} as Record<string, Partial<SymbolProfile>>;
        }

        const analysis = await getPortfolioAnalysis();
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

        return assetProfilesBySymbolsCache.get(cacheKey)!;
      };

      const getRecentActivities = async (take: number) => {
        if (!orderActivitiesPromise) {
          const effectiveTake = maxOrderTakeForRequest > 0 ? maxOrderTakeForRequest : take;
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

        const activities = await orderActivitiesPromise;

        return activities.slice(0, take);
      };

      const getFinancialNewsBySymbols = async (requestedSymbols: string[]) => {
        const cacheKey = [...requestedSymbols].sort().join('|');

        if (!financialNewsBySymbolsCache.has(cacheKey)) {
          financialNewsBySymbolsCache.set(
            cacheKey,
            this.getFinancialNewsHeadlines({
              symbols: requestedSymbols
            })
          );
        }

        return financialNewsBySymbolsCache.get(cacheKey)!;
      };

      const toolExecutionStartedAt = Date.now();
      const toolOutcomes = await Promise.all(
        policyDecision.toolsToExecute.map(async (toolName) => {
          try {
            if (toolName === 'portfolio_analysis') {
              const analysis = await getPortfolioAnalysis();

              return {
                citations: [
                  {
                    confidence: 0.9,
                    snippet: `${analysis.holdingsCount} holdings, total ${analysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}`,
                    source: toolName
                  }
                ],
                toolCall: {
                  input: {},
                  outputSummary: `${analysis.holdingsCount} holdings analyzed`,
                  status: 'success' as const,
                  tool: toolName
                }
              };
            } else if (toolName === 'get_portfolio_summary') {
              const analysis = await getPortfolioAnalysis();

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
              const analysis = await getPortfolioAnalysis();
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
              const analysis = await getPortfolioAnalysis();
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
                  outputSummary: `concentration ${currentRiskAssessment.concentrationBand}`,
                  status: 'success' as const,
                  tool: toolName
                }
              };
            } else if (toolName === 'get_portfolio_risk_metrics') {
              const analysis = await getPortfolioAnalysis();
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
                  outputSummary: `risk metrics ${currentRiskAssessment.concentrationBand} with HHI ${currentRiskAssessment.hhi.toFixed(3)}`,
                  status: 'success' as const,
                  tool: toolName
                }
              };
            } else if (toolName === 'market_data_lookup') {
              const requestedSymbols = await getResolvedSymbols();
              const currentMarketData = await getMarketDataBySymbols(requestedSymbols);
              const topQuote = currentMarketData.quotes[0];

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
                  outputSummary: `${currentMarketData.quotes.length}/${currentMarketData.symbolsRequested.length} quotes resolved`,
                  status: 'success' as const,
                  tool: toolName
                }
              };
            } else if (toolName === 'get_live_quote') {
              const requestedSymbols = await getResolvedSymbols();
              const currentMarketData = await getMarketDataBySymbols(requestedSymbols);
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
            } else if (toolName === 'get_asset_fundamentals') {
              const analysis = await getPortfolioAnalysis();
              const requestedSymbols = await getResolvedSymbols();
              const profilesBySymbol = await getAssetProfilesBySymbols(requestedSymbols);
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
              const headlines = await getFinancialNewsBySymbols(requestedSymbols);

              financialNewsSummary =
                headlines.length > 0
                  ? [
                      'News catalysts (latest):',
                      ...headlines.slice(0, 5).map(({ symbol, title }) => {
                        return `- ${symbol}: ${title}`;
                      }),
                      'Use headlines as catalyst context and confirm with filings, earnings transcripts, and guidance changes before acting.'
                    ].join('\n')
                  : 'Financial news lookup returned no headlines for the requested symbols.';

              return {
                citations: [
                  {
                    confidence: headlines.length > 0 ? 0.75 : 0.6,
                    snippet:
                      headlines.length > 0
                        ? `${headlines[0].symbol}: ${headlines[0].title}`
                        : 'No financial headlines were returned',
                    source: toolName
                  }
                ],
                toolCall: {
                  input: { symbols: requestedSymbols },
                  outputSummary: `${headlines.length} financial headlines resolved`,
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
                          activity.SymbolProfile?.symbol ?? activity.symbolProfileId;

                        return `${activity.type} ${symbol} ${activity.valueInBaseCurrency.toFixed(2)} ${userCurrency}`;
                      })
                      .join(' | ')}.`
                  : 'Recent transactions are currently unavailable.';

              return {
                citations: [
                  {
                    confidence: latestActivities.length > 0 ? 0.84 : 0.65,
                    snippet:
                      latestActivities.length > 0
                        ? `Latest transaction: ${latestActivities[0].type} ${(latestActivities[0].SymbolProfile?.symbol ?? latestActivities[0].symbolProfileId)} on ${new Date(latestActivities[0].date).toISOString().slice(0, 10)}`
                        : 'No recent transactions found',
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
                  activity.SymbolProfile?.symbol ?? activity.symbolProfileId ?? 'UNKNOWN';

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
              const taxableBase = Math.max(taxInput.income - taxInput.deductions, 0);
              const estimatedLiability = taxableBase * taxInput.taxRate;

              taxEstimateSummary = [
                `Tax estimate (assumption-based): income ${taxInput.income.toFixed(2)} ${userCurrency}, deductions ${taxInput.deductions.toFixed(2)} ${userCurrency}.`,
                `Estimated taxable base: ${taxableBase.toFixed(2)} ${userCurrency}.`,
                `Estimated tax liability at ${(taxInput.taxRate * 100).toFixed(1)}%: ${estimatedLiability.toFixed(2)} ${userCurrency}.`,
                'Assumptions: flat rate estimate for planning only; this is not filing-ready tax advice.'
              ].join('\n');

              return {
                citations: [
                  {
                    confidence: 0.74,
                    snippet: `Tax estimate: taxable base ${taxableBase.toFixed(2)} ${userCurrency}, liability ${estimatedLiability.toFixed(2)} ${userCurrency}`,
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
                  ? [`Violations: ${complianceResult.violations.join(' | ')}.`]
                  : []),
                ...(complianceResult.warnings.length > 0
                  ? [`Warnings: ${complianceResult.warnings.join(' | ')}.`]
                  : ['Warnings: no immediate rule flags detected from recent transactions.']),
                'Review account type, jurisdiction, and broker-specific constraints before execution.'
              ].join('\n');

              return {
                citations: [
                  {
                    confidence: complianceResult.violations.length > 0 ? 0.8 : 0.7,
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
              const analysis = await getPortfolioAnalysis();
              const currentRebalancePlan = runRebalancePlan({
                portfolioAnalysis: analysis
              });
              rebalancePlan = currentRebalancePlan;

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
                    maxAllocationTarget: currentRebalancePlan.maxAllocationTarget
                  },
                  outputSummary: `${currentRebalancePlan.overweightHoldings.length} overweight holdings`,
                  status: 'success' as const,
                  tool: toolName
                }
              };
            } else if (toolName === 'stress_test') {
              const analysis = await getPortfolioAnalysis();
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
                  input: { shockPercentage: currentStressTest.shockPercentage },
                  outputSummary: `estimated drawdown ${currentStressTest.estimatedDrawdownInBaseCurrency.toFixed(2)} ${userCurrency}`,
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
                    maxAllocationTarget: currentRebalancePlan.maxAllocationTarget
                  },
                  outputSummary: `${currentRebalancePlan.overweightHoldings.length} rebalance actions calculated`,
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
                    snippet: `Trade impact: ${tradeImpact.symbol} projected allocation ${(tradeImpact.projectedAllocation * 100).toFixed(2)}%`,
                    source: toolName
                  }
                ],
                toolCall: {
                  input: { query: normalizedQuery },
                  outputSummary: `trade impact simulated for ${tradeImpact.symbol}`,
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
                  error instanceof Error ? error.message : 'tool execution failed',
                status: 'failed' as const,
                tool: toolName
              }
            };
          }
        })
      );
      toolExecutionInMs = Date.now() - toolExecutionStartedAt;

      for (const { citations: toolCitations, toolCall } of toolOutcomes) {
        toolCalls.push(toolCall);

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

      verification.push({
        check: 'policy_gating',
        details: formatPolicyVerificationDetails({
          policyDecision
        }),
        status:
          policyDecision.blockedByPolicy || policyDecision.route === 'clarify'
            ? 'warning'
            : 'passed'
      });

      let answer = createPolicyRouteResponse({
        policyDecision,
        query: normalizedQuery
      });

      if (
        policyDecision.route === 'direct' &&
        policyDecision.blockReason === 'no_tool_query'
      ) {
        if (isPreferenceRecallQuery(normalizedQuery)) {
          answer = createPreferenceSummaryResponse({
            userPreferences: effectiveUserPreferences
          });
        } else if (preferenceUpdate.acknowledgement) {
          answer = preferenceUpdate.acknowledgement;
        }
      }

      if (policyDecision.route === 'tools') {
        const llmGenerationStartedAt = Date.now();
        answer = await buildAnswer({
          assetFundamentalsSummary,
          complianceCheckSummary,
          financialNewsSummary,
          generateText: (options) =>
            this.generateText({
              ...options,
              model,
              traceContext: {
                query: normalizedQuery,
                sessionId: resolvedSessionId,
                userId
              }
            }),
          languageCode,
          marketData,
          memory,
          portfolioAnalysis,
          query: normalizedQuery,
          recentTransactionsSummary,
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
          query: normalizedQuery
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

      const confidence = calculateConfidence({
        toolCalls,
        verification
      });

      const updatedMemoryTurns = [
        ...memory.turns,
        {
          answer,
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

      const response: AiAgentChatResponse = {
        answer,
        citations,
        confidence,
        memory: {
          sessionId: resolvedSessionId,
          turns: updatedMemoryTurns.length
        },
        toolCalls,
        verification
      };

      response.observability = await this.aiObservabilityService.captureChatSuccess({
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
        query: normalizedQuery,
        response,
        sessionId: resolvedSessionId,
        userId
      });

      return response;
    } catch (error) {
      await this.aiObservabilityService.captureChatFailure({
        durationInMs: Date.now() - chatStartedAt,
        error,
        query: normalizedQuery,
        sessionId: resolvedSessionId,
        userId
      });

      throw error;
    }
  }

  private decodeXmlEntities(value: string) {
    return value
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private extractTaxEstimateInput(query: string) {
    const normalized = query.toLowerCase();
    const numericTokens = Array.from(
      normalized.matchAll(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/g)
    )
      .map((match) => {
        return Number.parseFloat(match[1].replace(/,/g, ''));
      })
      .filter((value) => Number.isFinite(value));
    const incomePattern =
      /\b(?:income|salary|earnings?)\b[^\d$]*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i;
    const deductionsPattern =
      /\b(?:deduction|deductions|deductible|write[-\s]?off)\b[^\d$]*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/i;
    const taxRatePattern = /\b(?:tax\s*rate|rate)\b[^\d]*([0-9]{1,2}(?:\.[0-9]+)?)\s*%/i;
    const incomeMatch = incomePattern.exec(normalized);
    const deductionsMatch = deductionsPattern.exec(normalized);
    const taxRateMatch = taxRatePattern.exec(normalized);

    const parsedIncome = incomeMatch
      ? Number.parseFloat(incomeMatch[1].replace(/,/g, ''))
      : numericTokens[0];
    const parsedDeductions = deductionsMatch
      ? Number.parseFloat(deductionsMatch[1].replace(/,/g, ''))
      : numericTokens[1];
    const parsedTaxRate = taxRateMatch
      ? Number.parseFloat(taxRateMatch[1]) / 100
      : undefined;

    return {
      deductions: Number.isFinite(parsedDeductions) ? parsedDeductions : undefined,
      hasDeductions: Number.isFinite(parsedDeductions),
      hasIncome: Number.isFinite(parsedIncome),
      income: Number.isFinite(parsedIncome) ? parsedIncome : undefined,
      taxRate:
        Number.isFinite(parsedTaxRate) && parsedTaxRate > 0 && parsedTaxRate < 1
          ? parsedTaxRate
          : 0.22
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
        buysBySymbol.set(symbol, [...(buysBySymbol.get(symbol) ?? []), tradeDate]);
      } else if (type.includes('SELL')) {
        sellsBySymbol.set(symbol, [...(sellsBySymbol.get(symbol) ?? []), tradeDate]);
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
        symbols
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean)
      )
    ).map((symbol) => {
      return {
        dataSource: dataSourceBySymbol.get(symbol) ?? DataSource.YAHOO,
        symbol
      };
    });
  }

  private async getFinancialNewsHeadlines({
    symbols
  }: {
    symbols: string[];
  }): Promise<{ link: string; symbol: string; title: string }[]> {
    const targetSymbols = Array.from(
      new Set(
        symbols
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean)
      )
    ).slice(0, 2);
    const headlinesBySymbol = await Promise.all(
      targetSymbols.map(async (symbol) => {
        try {
          const response = await fetch(
            `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
          );

          if (!response.ok) {
            return [];
          }

          const xml = await response.text();
          const itemPattern = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/gi;
          let match: RegExpExecArray | null = itemPattern.exec(xml);
          const symbolHeadlines: { link: string; symbol: string; title: string }[] = [];

          while (match && symbolHeadlines.length < 3) {
            const title = this.decodeXmlEntities(match[1]).trim();
            const link = this.decodeXmlEntities(match[2]).trim();

            if (title) {
              symbolHeadlines.push({
                link,
                symbol,
                title
              });
            }

            match = itemPattern.exec(xml);
          }

          return symbolHeadlines;
        } catch {
          return [];
        }
      })
    );

    return headlinesBySymbol.flat().slice(0, 5);
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
      const matchingPortfolioHolding = portfolioAnalysis?.holdings.find((holding) => {
        return holding.symbol === symbol;
      });

      sections.push(`${symbol} — ${name} (${assetClass})`);
      sections.push(`Sectors: ${sectorMix}`);
      sections.push(`Countries: ${countryMix}`);

      if (topHoldings !== 'n/a') {
        sections.push(`Top holdings (if fund/ETF): ${topHoldings}`);
      }

      if (matchingPortfolioHolding && portfolioAnalysis.totalValueInBaseCurrency > 0) {
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
    projectedAllocation: number;
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
    const amount = Number.parseFloat(
      sellMatch?.[1] ?? buyMatch?.[1] ?? '1000'
    );
    const symbol = (
      sellMatch?.[2] ?? buyMatch?.[2] ?? defaultSymbol
    ).toUpperCase();
    const signedAmount = action === 'sell' ? -amount : amount;
    const holdingsBySymbol = new Map(
      portfolioAnalysis.holdings.map((holding) => {
        return [holding.symbol, Math.max(holding.valueInBaseCurrency, 0)];
      })
    );
    const currentSymbolValue = holdingsBySymbol.get(symbol) ?? 0;
    const projectedSymbolValue = Math.max(currentSymbolValue + signedAmount, 0);
    holdingsBySymbol.set(symbol, projectedSymbolValue);

    const projectedTotalValue = Math.max(
      portfolioAnalysis.totalValueInBaseCurrency + signedAmount,
      Number.EPSILON
    );
    const projectedAllocation = projectedSymbolValue / projectedTotalValue;
    const topProjectedHolding = Array.from(holdingsBySymbol.entries())
      .sort((a, b) => {
        return b[1] - a[1];
      })[0];
    const topProjectedAllocation = topProjectedHolding
      ? topProjectedHolding[1] / projectedTotalValue
      : 0;

    return {
      projectedAllocation,
      summary: `Trade impact simulation: ${action} ${amount.toFixed(2)} ${symbol} moves ${symbol} allocation to ${(projectedAllocation * 100).toFixed(2)}% and projected top holding to ${(topProjectedAllocation * 100).toFixed(2)}%.`,
      symbol
    };
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
}
