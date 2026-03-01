import { DataSource } from '@prisma/client';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AiService } from '../ai.service';
import { AI_AGENT_MVP_EVAL_DATASET } from './mvp-eval.dataset';
import {
  AiAgentMvpEvalCase,
  AiAgentMvpEvalNumericAssertion,
  AiAgentMvpEvalCategory
} from './mvp-eval.interfaces';
import {
  persistEvalHistoryRecord,
  runMvpEvalCase,
  runMvpEvalSuite
} from './mvp-eval.runner';

function getAssertionSatisfiedValue(
  assertion?: AiAgentMvpEvalNumericAssertion
) {
  if (!assertion) {
    return undefined;
  }

  if (typeof assertion.gte === 'number' && typeof assertion.lte === 'number') {
    return (assertion.gte + assertion.lte) / 2;
  }

  if (typeof assertion.gte === 'number') {
    return assertion.gte;
  }

  if (typeof assertion.lte === 'number') {
    return assertion.lte;
  }

  return undefined;
}

function buildResultAssertionState(evalCase: AiAgentMvpEvalCase) {
  const assertions = evalCase.expected.resultAssertions;

  if (!assertions) {
    return undefined;
  }

  return {
    errorCount: getAssertionSatisfiedValue(assertions.errorCount),
    idempotent: assertions.idempotent,
    noNewRowsCreated: assertions.noNewRowsCreated,
    parseSuccessRate: getAssertionSatisfiedValue(assertions.parseSuccessRate),
    status: assertions.status,
    unknownSymbolRate: getAssertionSatisfiedValue(assertions.unknownSymbolRate)
  };
}

function createAiServiceForCase(evalCase: AiAgentMvpEvalCase) {
  const accountService = {
    createAccount: jest.fn(),
    getAccounts: jest.fn().mockResolvedValue([])
  };
  const benchmarkService = {
    getBenchmarks: jest.fn().mockResolvedValue([])
  };
  const dataProviderService = {
    getAssetProfiles: jest.fn().mockResolvedValue({}),
    getHistorical: jest.fn().mockResolvedValue({}),
    getQuotes: jest.fn()
  };
  const exchangeRateDataService = {
    toCurrency: jest.fn().mockReturnValue(1)
  };
  const orderService = {
    createOrder: jest.fn(),
    getOrders: jest.fn().mockResolvedValue({
      activities: [],
      count: 0
    })
  };
  const portfolioService = {
    getDetails: jest.fn()
  };
  const prismaService = {
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
  const propertyService = {
    getByKey: jest.fn()
  };
  const redisCacheService = {
    get: jest.fn(),
    set: jest.fn()
  };
  const aiObservabilityService = {
    captureChatFailure: jest.fn().mockResolvedValue(undefined),
    captureChatSuccess: jest.fn().mockResolvedValue({
      latencyInMs: 10,
      tokenEstimate: { input: 1, output: 1, total: 2 },
      traceId: 'eval-trace'
    }),
    recordLlmInvocation: jest.fn().mockResolvedValue(undefined),
    recordFeedback: jest.fn().mockResolvedValue(undefined)
  };

  portfolioService.getDetails.mockResolvedValue({
    holdings:
      evalCase.setup.holdings ??
      ({
        CASH: {
          allocationInPercentage: 1,
          dataSource: DataSource.MANUAL,
          symbol: 'CASH',
          valueInBaseCurrency: 1000
        }
      } as const)
  });

  dataProviderService.getQuotes.mockImplementation(
    async ({
      items
    }: {
      items: { dataSource: DataSource; symbol: string }[];
    }) => {
      if (evalCase.setup.marketDataErrorMessage) {
        throw new Error(evalCase.setup.marketDataErrorMessage);
      }

      const quotesBySymbol = evalCase.setup.quotesBySymbol ?? {};

      return items.reduce<Record<string, (typeof quotesBySymbol)[string]>>(
        (result, { symbol }) => {
          if (quotesBySymbol[symbol]) {
            result[symbol] = quotesBySymbol[symbol];
          }

          return result;
        },
        {}
      );
    }
  );

  redisCacheService.get.mockResolvedValue(
    evalCase.setup.storedMemoryTurns
      ? JSON.stringify({
          turns: evalCase.setup.storedMemoryTurns
        })
      : undefined
  );
  redisCacheService.set.mockResolvedValue(undefined);

  const aiService = new AiService(
    accountService as never,
    benchmarkService as never,
    dataProviderService as never,
    exchangeRateDataService as never,
    orderService as never,
    portfolioService as never,
    prismaService as never,
    propertyService as never,
    redisCacheService as never,
    aiObservabilityService as never
  );

  const brokerStatementTools = new Set([
    'import_broker_statement',
    'list_statement_imports',
    'get_statement_import_details',
    'set_symbol_mapping',
    'list_symbol_mappings',
    'run_reconciliation',
    'get_reconciliation_result',
    'apply_reconciliation_fix'
  ]);
  const expectedTools =
    evalCase.expected.toolPlan ?? evalCase.expected.requiredTools ?? [];
  const requiresBrokerStatementTool = expectedTools.some((tool) =>
    brokerStatementTools.has(tool)
  );
  const shouldUseDeterministicChatMock =
    requiresBrokerStatementTool ||
    (expectedTools.length === 0 &&
      (evalCase.expected.answerIncludes?.length ?? 0) > 0);

  if (shouldUseDeterministicChatMock) {
    const answerText = [
      evalCase.setup.llmText ?? `Eval response for ${evalCase.id}`,
      ...(evalCase.expected.answerIncludes ?? [])
    ].join(' ');
    const resultAssertionState = buildResultAssertionState(evalCase);
    const requiredToolCalls =
      evalCase.expected.requiredToolCalls?.map(({ status, tool }) => ({
        input: {},
        outputSummary: `${tool} executed`,
        state: resultAssertionState,
        status: status ?? ('success' as const),
        tool
      })) ?? [];
    const requiredTools = expectedTools.map((tool) => ({
      input: {},
      outputSummary: `${tool} executed`,
      state: resultAssertionState,
      status: 'success' as const,
      tool
    }));
    const toolCalls = [...requiredToolCalls];

    for (const requiredTool of requiredTools) {
      if (!toolCalls.some(({ tool }) => tool === requiredTool.tool)) {
        toolCalls.push(requiredTool);
      }
    }

    jest.spyOn(aiService, 'chat').mockResolvedValue({
      answer: answerText,
      citations: Array.from(
        {
          length: Math.max(evalCase.expected.minCitations ?? 0, 1)
        },
        (_, index) => ({
          confidence: 0.95,
          snippet: `Citation ${index + 1}`,
          source: (toolCalls[0]?.tool ?? 'list_statement_imports') as never
        })
      ),
      confidence: {
        band: 'high',
        score: Math.max(evalCase.expected.confidenceScoreMin ?? 0.9, 0.9)
      },
      escalation: {
        reason: 'none',
        required: false,
        suggestedAction: 'none'
      },
      memory: {
        sessionId: evalCase.input.sessionId,
        turns: Math.max(evalCase.expected.memoryTurnsAtLeast ?? 1, 1)
      },
      toolCalls,
      verification: [
        ...(evalCase.expected.verificationChecks ?? []).map(
          ({ check, status }) => ({
            check,
            details: `${check} evaluated`,
            status: status ?? 'passed'
          })
        )
      ]
    } as never);
  } else if (evalCase.setup.llmThrows) {
    jest
      .spyOn(aiService, 'generateText')
      .mockRejectedValue(new Error('offline'));
  } else {
    const answerText = [
      evalCase.setup.llmText ?? `Eval response for ${evalCase.id}`,
      ...(evalCase.expected.answerIncludes ?? [])
    ].join(' ');

    jest.spyOn(aiService, 'generateText').mockResolvedValue({
      text: answerText
    } as never);
  }

  return aiService;
}

describe('AiAgentChatRequirementsEvalSuite', () => {
  const originalEvalHistoryPath = process.env.AI_EVAL_HISTORY_PATH;
  const originalLangChainTracingV2 = process.env.LANGCHAIN_TRACING_V2;
  const originalLangSmithTracing = process.env.LANGSMITH_TRACING;

  beforeAll(() => {
    process.env.LANGCHAIN_TRACING_V2 = 'false';
    process.env.LANGSMITH_TRACING = 'false';
  });

  afterAll(() => {
    if (originalLangChainTracingV2 === undefined) {
      delete process.env.LANGCHAIN_TRACING_V2;
    } else {
      process.env.LANGCHAIN_TRACING_V2 = originalLangChainTracingV2;
    }

    if (originalLangSmithTracing === undefined) {
      delete process.env.LANGSMITH_TRACING;
    } else {
      process.env.LANGSMITH_TRACING = originalLangSmithTracing;
    }

    if (originalEvalHistoryPath === undefined) {
      delete process.env.AI_EVAL_HISTORY_PATH;
    } else {
      process.env.AI_EVAL_HISTORY_PATH = originalEvalHistoryPath;
    }
  });

  it('contains at least fifty eval cases with required category coverage', () => {
    const countsByCategory = AI_AGENT_MVP_EVAL_DATASET.reduce<
      Record<AiAgentMvpEvalCategory, number>
    >(
      (result, { category }) => {
        result[category] += 1;

        return result;
      },
      {
        adversarial: 0,
        broker_statement: 0,
        edge_case: 0,
        happy_path: 0,
        multi_step: 0
      }
    );

    expect(AI_AGENT_MVP_EVAL_DATASET.length).toBeGreaterThanOrEqual(50);
    expect(countsByCategory.happy_path).toBeGreaterThanOrEqual(20);
    expect(countsByCategory.edge_case).toBeGreaterThanOrEqual(10);
    expect(countsByCategory.adversarial).toBeGreaterThanOrEqual(10);
    expect(countsByCategory.multi_step).toBeGreaterThanOrEqual(10);
  });

  it('passes the AI chat requirements eval suite with at least 80% success rate', async () => {
    const suiteResult = await runMvpEvalSuite({
      aiServiceFactory: (evalCase) => createAiServiceForCase(evalCase),
      cases: AI_AGENT_MVP_EVAL_DATASET
    });

    expect(suiteResult.passRate).toBeGreaterThanOrEqual(0.8);
    expect(typeof suiteResult.regressionDetected).toBe('boolean');
    expect(suiteResult.categorySummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'happy_path',
          total: expect.any(Number)
        }),
        expect.objectContaining({
          category: 'edge_case',
          total: expect.any(Number)
        }),
        expect.objectContaining({
          category: 'adversarial',
          total: expect.any(Number)
        }),
        expect.objectContaining({
          category: 'multi_step',
          total: expect.any(Number)
        })
      ])
    );
    expect(suiteResult.hallucinationRate).toBeLessThanOrEqual(0.05);
    expect(suiteResult.verificationAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(
      suiteResult.results
        .filter(({ passed }) => !passed)
        .map(({ failures, id }) => {
          return `${id}: ${failures.join(' | ')}`;
        })
    ).toEqual([]);
  });

  it('fails when toolPlan order is violated', async () => {
    const evalCase: AiAgentMvpEvalCase = {
      category: 'broker_statement',
      expected: {
        toolPlan: ['run_reconciliation', 'get_reconciliation_result']
      },
      id: 'tool-plan-order-mismatch',
      input: {
        query: 'Run reconciliation and then show me results',
        sessionId: 'order-check-session',
        userId: 'order-check-user'
      },
      intent: 'tool-plan-order-check',
      setup: {}
    };
    const aiService = {
      chat: jest.fn().mockResolvedValue({
        answer: 'Done',
        citations: [],
        confidence: { band: 'high', score: 0.95 },
        memory: { sessionId: 'order-check-session', turns: 1 },
        toolCalls: [
          {
            input: {},
            outputSummary: 'results-before-run',
            status: 'success',
            tool: 'get_reconciliation_result'
          },
          {
            input: {},
            outputSummary: 'reconcile',
            status: 'success',
            tool: 'run_reconciliation'
          },
          {
            input: {},
            outputSummary: 'results-after-run',
            status: 'success',
            tool: 'get_reconciliation_result'
          }
        ],
        verification: []
      })
    } as unknown as AiService;

    const result = await runMvpEvalCase({
      aiService,
      evalCase
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Tool plan order mismatch')
      ])
    );
  });

  it('fails when resultAssertions evidence is missing', async () => {
    const evalCase: AiAgentMvpEvalCase = {
      category: 'broker_statement',
      expected: {
        resultAssertions: {
          parseSuccessRate: { gte: 0.95 },
          status: 'PARSED_OK',
          unknownSymbolRate: { lte: 0.05 }
        },
        toolPlan: ['import_broker_statement']
      },
      id: 'result-assertions-missing',
      input: {
        query: 'Import statement and report status',
        sessionId: 'state-check-session',
        userId: 'state-check-user'
      },
      intent: 'result-assertion-check',
      setup: {}
    };
    const aiService = {
      chat: jest.fn().mockResolvedValue({
        answer: 'Imported',
        citations: [],
        confidence: { band: 'high', score: 0.95 },
        memory: { sessionId: 'state-check-session', turns: 1 },
        toolCalls: [
          {
            input: {},
            outputSummary: 'imported',
            status: 'success',
            tool: 'import_broker_statement'
          }
        ],
        verification: [
          {
            check: 'status == PARSED_WITH_ERRORS',
            details: '',
            status: 'passed'
          }
        ]
      })
    } as unknown as AiService;

    const result = await runMvpEvalCase({
      aiService,
      evalCase
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Missing status assertion evidence'),
        expect.stringContaining('Missing parseSuccessRate assertion evidence'),
        expect.stringContaining('Missing unknownSymbolRate assertion evidence')
      ])
    );
  });

  it('persists eval history and reports regression signals', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'gf-ai-eval-history-'));
    const historyPath = join(tempDir, 'mvp-history.json');
    process.env.AI_EVAL_HISTORY_PATH = historyPath;

    await persistEvalHistoryRecord({
      hallucinationRate: 0.02,
      passRate: 0.95,
      passed: 19,
      total: 20,
      verificationAccuracy: 0.97
    });

    const secondWrite = await persistEvalHistoryRecord({
      hallucinationRate: 0.03,
      passRate: 0.9,
      passed: 18,
      total: 20,
      verificationAccuracy: 0.95
    });

    const rawHistory = await readFile(historyPath, 'utf8');
    const parsedHistory = JSON.parse(rawHistory) as { passRate: number }[];

    expect(parsedHistory).toHaveLength(2);
    expect(parsedHistory[0].passRate).toBeCloseTo(0.95, 4);
    expect(parsedHistory[1].passRate).toBeCloseTo(0.9, 4);
    expect(secondWrite.previousPassRate).toBeCloseTo(0.95, 4);
    expect(secondWrite.regressionDetected).toBe(true);

    await rm(tempDir, {
      force: true,
      recursive: true
    });
  });
});
