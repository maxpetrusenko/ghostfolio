import { DataSource } from '@prisma/client';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { AiService } from '../ai.service';

import { AI_AGENT_MVP_EVAL_DATASET } from './mvp-eval.dataset';
import {
  persistEvalHistoryRecord,
  runMvpEvalSuite
} from './mvp-eval.runner';
import {
  AiAgentMvpEvalCase,
  AiAgentMvpEvalCategory
} from './mvp-eval.interfaces';

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
    propertyService as never,
    redisCacheService as never,
    aiObservabilityService as never
  );

  if (evalCase.setup.llmThrows) {
    jest.spyOn(aiService, 'generateText').mockRejectedValue(new Error('offline'));
  } else {
    jest.spyOn(aiService, 'generateText').mockResolvedValue({
      text: evalCase.setup.llmText ?? `Eval response for ${evalCase.id}`
    } as never);
  }

  return aiService;
}

describe('AiAgentMvpEvalSuite', () => {
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

  it('passes the MVP eval suite with at least 80% success rate', async () => {
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
