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
  AiAgentChatResponse,
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
  formatPolicyVerificationDetails
} from './ai-agent.policy.utils';
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
    prompt,
    signal,
    traceContext
  }: {
    prompt: string;
    signal?: AbortSignal;
    traceContext?: {
      query?: string;
      sessionId?: string;
      userId?: string;
    };
  }) {
    const zAiGlmApiKey =
      process.env.z_ai_glm_api_key ?? process.env.Z_AI_GLM_API_KEY;
    const zAiGlmModel = process.env.z_ai_glm_model ?? process.env.Z_AI_GLM_MODEL;
    const minimaxApiKey =
      process.env.minimax_api_key ?? process.env.MINIMAX_API_KEY;
    const minimaxModel = process.env.minimax_model ?? process.env.MINIMAX_MODEL;
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
          prompt,
          provider,
          query: traceContext?.query,
          sessionId: traceContext?.sessionId,
          userId: traceContext?.userId
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

    if (zAiGlmApiKey) {
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
        providerErrors.push(
          `z_ai_glm: ${error instanceof Error ? error.message : 'request failed'}`
        );
      }
    }

    if (minimaxApiKey) {
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
      run: () =>
        generateText({
          prompt,
          abortSignal: signal,
          model: openRouterService.chat(openRouterModel)
        })
    });
  }

  public async chat({
    languageCode,
    query,
    sessionId,
    symbols,
    userCurrency,
    userId
  }: {
    languageCode: string;
    query: string;
    sessionId?: string;
    symbols?: string[];
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

      const plannedTools = determineToolPlan({
        query: normalizedQuery,
        symbols
      });
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
      let financialNewsSummary: string | undefined;
      let recentTransactionsSummary: string | undefined;
      let tradeImpactSummary: string | undefined;

      for (const toolName of policyDecision.toolsToExecute) {
        const toolStartedAt = Date.now();

        try {
          if (toolName === 'portfolio_analysis') {
            portfolioAnalysis = await runPortfolioAnalysis({
              portfolioService: this.portfolioService,
              userId
            });

            toolCalls.push({
              input: {},
              outputSummary: `${portfolioAnalysis.holdingsCount} holdings analyzed`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.9,
              snippet: `${portfolioAnalysis.holdingsCount} holdings, total ${portfolioAnalysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}`,
              source: toolName
            });
          } else if (toolName === 'get_portfolio_summary') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            toolCalls.push({
              input: {},
              outputSummary: `portfolio total ${portfolioAnalysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.9,
              snippet: `Portfolio summary: ${portfolioAnalysis.holdingsCount} holdings, total ${portfolioAnalysis.totalValueInBaseCurrency.toFixed(2)} ${userCurrency}`,
              source: toolName
            });
          } else if (toolName === 'get_current_holdings') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            const holdingsSummary = portfolioAnalysis.holdings
              .slice(0, 3)
              .map(({ allocationInPercentage, symbol }) => {
                return `${symbol} ${(allocationInPercentage * 100).toFixed(1)}%`;
              })
              .join(', ');

            toolCalls.push({
              input: {},
              outputSummary: `${portfolioAnalysis.holdingsCount} current holdings returned`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.88,
              snippet:
                holdingsSummary.length > 0
                  ? `Current holdings: ${holdingsSummary}`
                  : 'Current holdings are available with no active positions',
              source: toolName
            });
          } else if (toolName === 'risk_assessment') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            riskAssessment = runRiskAssessment({
              portfolioAnalysis
            });

            toolCalls.push({
              input: {},
              outputSummary: `concentration ${riskAssessment.concentrationBand}`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.85,
              snippet: `top allocation ${(riskAssessment.topHoldingAllocation * 100).toFixed(2)}%, HHI ${riskAssessment.hhi.toFixed(3)}`,
              source: toolName
            });
          } else if (toolName === 'get_portfolio_risk_metrics') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            if (!riskAssessment) {
              riskAssessment = runRiskAssessment({
                portfolioAnalysis
              });
            }

            toolCalls.push({
              input: {},
              outputSummary: `risk metrics ${riskAssessment.concentrationBand} with HHI ${riskAssessment.hhi.toFixed(3)}`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.87,
              snippet: `Risk metrics: concentration ${riskAssessment.concentrationBand}, top allocation ${(riskAssessment.topHoldingAllocation * 100).toFixed(2)}%, HHI ${riskAssessment.hhi.toFixed(3)}`,
              source: toolName
            });
          } else if (toolName === 'market_data_lookup') {
            const requestedSymbols = resolveSymbols({
              portfolioAnalysis,
              query: normalizedQuery,
              symbols
            });

            marketData = await runMarketDataLookup({
              dataProviderService: this.dataProviderService,
              portfolioAnalysis,
              symbols: requestedSymbols
            });

            toolCalls.push({
              input: { symbols: requestedSymbols },
              outputSummary: `${marketData.quotes.length}/${marketData.symbolsRequested.length} quotes resolved`,
              status: 'success',
              tool: toolName
            });

            if (marketData.quotes.length > 0) {
              const topQuote = marketData.quotes[0];

              citations.push({
                confidence: 0.82,
                snippet: `${topQuote.symbol} ${topQuote.marketPrice.toFixed(2)} ${topQuote.currency}`,
                source: toolName
              });
            }
          } else if (toolName === 'get_live_quote') {
            const requestedSymbols = resolveSymbols({
              portfolioAnalysis,
              query: normalizedQuery,
              symbols
            });

            marketData = await runMarketDataLookup({
              dataProviderService: this.dataProviderService,
              portfolioAnalysis,
              symbols: requestedSymbols
            });

            toolCalls.push({
              input: { symbols: requestedSymbols },
              outputSummary: `${marketData.quotes.length}/${marketData.symbolsRequested.length} live quotes resolved`,
              status: 'success',
              tool: toolName
            });

            if (marketData.quotes.length > 0) {
              const topQuote = marketData.quotes[0];

              citations.push({
                confidence: 0.82,
                snippet: `Live quote: ${topQuote.symbol} ${topQuote.marketPrice.toFixed(2)} ${topQuote.currency}`,
                source: toolName
              });
            }
          } else if (toolName === 'get_asset_fundamentals') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            const requestedSymbols = resolveSymbols({
              portfolioAnalysis,
              query: normalizedQuery,
              symbols
            });
            const symbolIdentifiers = this.extractSymbolIdentifiersFromPortfolio({
              portfolioAnalysis,
              symbols: requestedSymbols
            });
            const profilesBySymbol =
              symbolIdentifiers.length > 0
                ? await this.dataProviderService.getAssetProfiles(symbolIdentifiers)
                : {};
            const profileSymbols = Object.keys(profilesBySymbol);
            const topProfile = profileSymbols[0]
              ? profilesBySymbol[profileSymbols[0]]
              : undefined;

            assetFundamentalsSummary = this.buildAssetFundamentalsSummary({
              portfolioAnalysis,
              profilesBySymbol,
              requestedSymbols,
              userCurrency
            });

            toolCalls.push({
              input: { symbols: requestedSymbols },
              outputSummary: `${profileSymbols.length}/${requestedSymbols.length} fundamentals resolved`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.8,
              snippet:
                topProfile && profileSymbols[0]
                  ? `Fundamentals: ${profileSymbols[0]} ${topProfile.name ?? profileSymbols[0]} (${topProfile.assetClass ?? 'unknown_class'})`
                  : 'Fundamentals coverage is limited for requested symbols',
              source: toolName
            });
          } else if (toolName === 'get_financial_news') {
            const requestedSymbols = resolveSymbols({
              portfolioAnalysis,
              query: normalizedQuery,
              symbols
            });
            const headlines = await this.getFinancialNewsHeadlines({
              symbols: requestedSymbols
            });

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

            toolCalls.push({
              input: { symbols: requestedSymbols },
              outputSummary: `${headlines.length} financial headlines resolved`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: headlines.length > 0 ? 0.75 : 0.6,
              snippet:
                headlines.length > 0
                  ? `${headlines[0].symbol}: ${headlines[0].title}`
                  : 'No financial headlines were returned',
              source: toolName
            });
          } else if (toolName === 'get_recent_transactions') {
            const { activities } = await this.orderService.getOrders({
              sortColumn: 'date',
              sortDirection: 'desc',
              take: 5,
              userCurrency,
              userId
            });
            const latestActivities = activities.slice(0, 5);

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

            toolCalls.push({
              input: { take: 5 },
              outputSummary: `${latestActivities.length} recent transactions returned`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: latestActivities.length > 0 ? 0.84 : 0.65,
              snippet:
                latestActivities.length > 0
                  ? `Latest transaction: ${latestActivities[0].type} ${(latestActivities[0].SymbolProfile?.symbol ?? latestActivities[0].symbolProfileId)} on ${new Date(latestActivities[0].date).toISOString().slice(0, 10)}`
                  : 'No recent transactions found',
              source: toolName
            });
          } else if (toolName === 'rebalance_plan') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            rebalancePlan = runRebalancePlan({
              portfolioAnalysis
            });

            toolCalls.push({
              input: { maxAllocationTarget: rebalancePlan.maxAllocationTarget },
              outputSummary: `${rebalancePlan.overweightHoldings.length} overweight holdings`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.8,
              snippet:
                rebalancePlan.overweightHoldings.length > 0
                  ? `${rebalancePlan.overweightHoldings[0].symbol} exceeds target by ${(rebalancePlan.overweightHoldings[0].reductionNeeded * 100).toFixed(1)}pp`
                  : 'No overweight holdings above max allocation target',
              source: toolName
            });
          } else if (toolName === 'stress_test') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            stressTest = runStressTest({
              portfolioAnalysis
            });

            toolCalls.push({
              input: { shockPercentage: stressTest.shockPercentage },
              outputSummary: `estimated drawdown ${stressTest.estimatedDrawdownInBaseCurrency.toFixed(2)} ${userCurrency}`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.8,
              snippet: `${(stressTest.shockPercentage * 100).toFixed(0)}% shock drawdown ${stressTest.estimatedDrawdownInBaseCurrency.toFixed(2)} ${userCurrency}`,
              source: toolName
            });
          } else if (toolName === 'calculate_rebalance_plan') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            rebalancePlan = runRebalancePlan({
              portfolioAnalysis
            });

            toolCalls.push({
              input: { maxAllocationTarget: rebalancePlan.maxAllocationTarget },
              outputSummary: `${rebalancePlan.overweightHoldings.length} rebalance actions calculated`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.82,
              snippet:
                rebalancePlan.overweightHoldings.length > 0
                  ? `Rebalance action: ${rebalancePlan.overweightHoldings[0].symbol} trim ${(rebalancePlan.overweightHoldings[0].reductionNeeded * 100).toFixed(1)}pp`
                  : 'Rebalance action: no holding exceeds target allocation',
              source: toolName
            });
          } else if (toolName === 'simulate_trade_impact') {
            if (!portfolioAnalysis) {
              portfolioAnalysis = await runPortfolioAnalysis({
                portfolioService: this.portfolioService,
                userId
              });
            }

            const tradeImpact = this.simulateTradeImpact({
              portfolioAnalysis,
              query: normalizedQuery
            });
            tradeImpactSummary = tradeImpact.summary;

            toolCalls.push({
              input: { query: normalizedQuery },
              outputSummary: `trade impact simulated for ${tradeImpact.symbol}`,
              status: 'success',
              tool: toolName
            });

            citations.push({
              confidence: 0.8,
              snippet: `Trade impact: ${tradeImpact.symbol} projected allocation ${(tradeImpact.projectedAllocation * 100).toFixed(2)}%`,
              source: toolName
            });
          }
        } catch (error) {
          toolCalls.push({
            input: {},
            outputSummary: error?.message ?? 'tool execution failed',
            status: 'failed',
            tool: toolName
          });
        } finally {
          toolExecutionInMs += Date.now() - toolStartedAt;
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
          financialNewsSummary,
          generateText: (options) =>
            this.generateText({
              ...options,
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
          tradeImpactSummary,
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
    const headlines: { link: string; symbol: string; title: string }[] = [];

    for (const symbol of targetSymbols) {
      try {
        const response = await fetch(
          `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
        );

        if (!response.ok) {
          continue;
        }

        const xml = await response.text();
        const itemPattern = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/gi;
        let match: RegExpExecArray | null = itemPattern.exec(xml);
        let addedForSymbol = 0;

        while (match && addedForSymbol < 3) {
          const title = this.decodeXmlEntities(match[1]).trim();
          const link = this.decodeXmlEntities(match[2]).trim();

          if (title) {
            headlines.push({
              link,
              symbol,
              title
            });
            addedForSymbol += 1;
          }

          match = itemPattern.exec(xml);
        }
      } catch {}
    }

    return headlines.slice(0, 5);
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

    const normalized = entries.reduce<Array<{ label: string; weight?: number }>>(
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
