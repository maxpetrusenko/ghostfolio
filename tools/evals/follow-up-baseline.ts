import {
  AiAgentFollowUpResolverPreviousTurn,
  resolveFollowUpSignal
} from '../../apps/api/src/app/endpoints/ai/ai-agent.policy.utils';
import { AiAgentToolName } from '../../apps/api/src/app/endpoints/ai/ai-agent.interfaces';

interface FollowUpBaselineCase {
  expectedFollowUp: boolean;
  id: string;
  inferredPlannedTools: AiAgentToolName[];
  previousTurn?: AiAgentFollowUpResolverPreviousTurn;
  query: string;
}

const PREVIOUS_PORTFOLIO_TURN: AiAgentFollowUpResolverPreviousTurn = {
  context: {
    entities: ['4%', 'fire'],
    goalType: 'analyze',
    primaryScope: 'fire'
  },
  query: 'Am I on track for FIRE with a 4% withdrawal rate?',
  successfulTools: ['fire_analysis'],
  timestamp: new Date().toISOString()
};

const FOLLOW_UP_BASELINE_CASES: FollowUpBaselineCase[] = [
  {
    expectedFollowUp: true,
    id: 'fu-001-what-if',
    inferredPlannedTools: [],
    previousTurn: PREVIOUS_PORTFOLIO_TURN,
    query: 'what if we change percentage to 6%'
  },
  {
    expectedFollowUp: true,
    id: 'fu-002-modification',
    inferredPlannedTools: [],
    previousTurn: PREVIOUS_PORTFOLIO_TURN,
    query: 'use 6% instead'
  },
  {
    expectedFollowUp: true,
    id: 'fu-003-short-why',
    inferredPlannedTools: [],
    previousTurn: PREVIOUS_PORTFOLIO_TURN,
    query: 'why?'
  },
  {
    expectedFollowUp: true,
    id: 'fu-004-pronoun',
    inferredPlannedTools: [],
    previousTurn: PREVIOUS_PORTFOLIO_TURN,
    query: 'should i split those?'
  },
  {
    expectedFollowUp: false,
    id: 'fu-005-standalone-market',
    inferredPlannedTools: ['market_data_lookup'],
    previousTurn: PREVIOUS_PORTFOLIO_TURN,
    query: 'Get latest quote and fundamentals for NVDA'
  },
  {
    expectedFollowUp: false,
    id: 'fu-006-clear-new-request',
    inferredPlannedTools: ['portfolio_analysis'],
    query: 'Analyze my portfolio allocation and concentration risk'
  },
  {
    expectedFollowUp: false,
    id: 'fu-007-news-request',
    inferredPlannedTools: ['get_financial_news'],
    previousTurn: PREVIOUS_PORTFOLIO_TURN,
    query: 'what is the latest news on TSLA today?'
  },
  {
    expectedFollowUp: false,
    id: 'fu-008-order-action',
    inferredPlannedTools: ['create_order'],
    query: 'create an order for 10 shares of AAPL at 150 USD'
  }
];

function toRate(value: number) {
  return Number(value.toFixed(4));
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function main() {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  const results = FOLLOW_UP_BASELINE_CASES.map((evalCase) => {
    const signal = resolveFollowUpSignal({
      inferredPlannedTools: evalCase.inferredPlannedTools,
      previousTurn: evalCase.previousTurn,
      query: evalCase.query
    });
    const predictedFollowUp = signal.isLikelyFollowUp;

    if (evalCase.expectedFollowUp && predictedFollowUp) {
      tp += 1;
    } else if (!evalCase.expectedFollowUp && !predictedFollowUp) {
      tn += 1;
    } else if (!evalCase.expectedFollowUp && predictedFollowUp) {
      fp += 1;
    } else {
      fn += 1;
    }

    return {
      expectedFollowUp: evalCase.expectedFollowUp,
      id: evalCase.id,
      predictedFollowUp,
      query: evalCase.query
    };
  });

  const total = FOLLOW_UP_BASELINE_CASES.length;
  const precision = safeDivide(tp, tp + fp);
  const recall = safeDivide(tp, tp + fn);
  const accuracy = safeDivide(tp + tn, total);
  const falsePositiveRate = safeDivide(fp, fp + tn);

  const summary = {
    accuracy: toRate(accuracy),
    falsePositiveRate: toRate(falsePositiveRate),
    precision: toRate(precision),
    recall: toRate(recall),
    totals: {
      fn,
      fp,
      tn,
      total,
      tp
    }
  };

  // Keep output machine-friendly for quick CI baseline comparisons.
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        results,
        summary
      },
      null,
      2
    )
  );
}

main();
