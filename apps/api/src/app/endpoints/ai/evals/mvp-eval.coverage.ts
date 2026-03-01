import { AiAgentToolName } from '../ai-agent.interfaces';
import {
  AiAgentMvpEvalCase,
  AiAgentMvpScenarioCategory,
  AiAgentMvpScenarioDifficulty,
  AiAgentMvpScenarioLabels,
  AiAgentMvpScenarioToolBucket
} from './mvp-eval.interfaces';

export const SCENARIO_DIFFICULTIES: AiAgentMvpScenarioDifficulty[] = [
  'straightforward',
  'ambiguous',
  'edge_case'
];

export const SCENARIO_TOOL_BUCKETS: AiAgentMvpScenarioToolBucket[] = [
  'portfolio',
  'risk',
  'market',
  'rebalance',
  'stress',
  'multi'
];

function detectScenarioCategory({
  category,
  normalizedText
}: {
  category: AiAgentMvpEvalCase['category'];
  normalizedText: string;
}): AiAgentMvpScenarioCategory {
  if (category === 'adversarial') {
    return 'attack';
  }

  if (category === 'edge_case') {
    return 'edge_case';
  }

  if (
    /\b(?:risk|concentration|drawdown|stress|shock|diversif|rebalance)\b/.test(
      normalizedText
    )
  ) {
    return 'risk';
  }

  if (/\b(?:my|me|our|user)\b/.test(normalizedText)) {
    return 'persona';
  }

  return 'workflow';
}

function detectDifficulty({
  category,
  normalizedText
}: {
  category: AiAgentMvpEvalCase['category'];
  normalizedText: string;
}): AiAgentMvpScenarioDifficulty {
  if (category === 'edge_case') {
    return 'edge_case';
  }

  if (
    /\b(?:what can i do|what should i do|help me|recommend|next|how do i|maybe)\b/.test(
      normalizedText
    )
  ) {
    return 'ambiguous';
  }

  return 'straightforward';
}

function detectToolBucket({
  expectedTools
}: {
  expectedTools?: AiAgentToolName[];
}): AiAgentMvpScenarioToolBucket {
  const uniqueRequiredTools = Array.from(new Set(expectedTools ?? []));

  if (uniqueRequiredTools.length === 0) {
    return 'none';
  }

  if (uniqueRequiredTools.length > 1) {
    return 'multi';
  }

  switch (uniqueRequiredTools[0]) {
    case 'portfolio_analysis':
      return 'portfolio';
    case 'risk_assessment':
      return 'risk';
    case 'market_data_lookup':
      return 'market';
    case 'rebalance_plan':
      return 'rebalance';
    case 'stress_test':
      return 'stress';
    default:
      return 'none';
  }
}

export function deriveScenarioLabels({
  category,
  expected,
  input,
  intent
}: Pick<
  AiAgentMvpEvalCase,
  'category' | 'expected' | 'input' | 'intent'
>): AiAgentMvpScenarioLabels {
  const normalizedText = `${input.query} ${intent}`.toLowerCase();
  const scenarioCategory = detectScenarioCategory({ category, normalizedText });
  const difficulty = detectDifficulty({ category, normalizedText });
  const toolBucket = detectToolBucket({
    expectedTools: expected.toolPlan ?? expected.requiredTools
  });

  return {
    category: scenarioCategory,
    difficulty,
    subcategory: intent,
    tags: [scenarioCategory, difficulty, toolBucket, category],
    toolBucket
  };
}

export function buildScenarioCoverageMatrix({
  cases
}: {
  cases: AiAgentMvpEvalCase[];
}) {
  const matrix = SCENARIO_DIFFICULTIES.reduce<
    Record<
      AiAgentMvpScenarioDifficulty,
      Record<AiAgentMvpScenarioToolBucket, number>
    >
  >(
    (result, difficulty) => {
      result[difficulty] = {
        market: 0,
        multi: 0,
        none: 0,
        portfolio: 0,
        rebalance: 0,
        risk: 0,
        stress: 0
      };

      return result;
    },
    {} as Record<
      AiAgentMvpScenarioDifficulty,
      Record<AiAgentMvpScenarioToolBucket, number>
    >
  );
  const scenarioCategoryCounts: Record<AiAgentMvpScenarioCategory, number> = {
    attack: 0,
    edge_case: 0,
    persona: 0,
    risk: 0,
    workflow: 0
  };

  for (const evalCase of cases) {
    const labels =
      evalCase.labels ??
      deriveScenarioLabels({
        category: evalCase.category,
        expected: evalCase.expected,
        input: evalCase.input,
        intent: evalCase.intent
      });

    scenarioCategoryCounts[labels.category] += 1;
    matrix[labels.difficulty][labels.toolBucket] += 1;
  }

  const emptyCells = SCENARIO_DIFFICULTIES.flatMap((difficulty) => {
    return SCENARIO_TOOL_BUCKETS.filter((toolBucket) => {
      return matrix[difficulty][toolBucket] === 0;
    }).map((toolBucket) => `${difficulty}:${toolBucket}`);
  });

  return {
    emptyCells,
    matrix,
    scenarioCategoryCounts
  };
}

export function formatScenarioCoverageTable({
  cases
}: {
  cases: AiAgentMvpEvalCase[];
}) {
  const { emptyCells, matrix, scenarioCategoryCounts } =
    buildScenarioCoverageMatrix({ cases });
  const header = `| difficulty | portfolio | risk | market | rebalance | stress | multi |`;
  const divider = `|---|---:|---:|---:|---:|---:|---:|`;
  const rows = SCENARIO_DIFFICULTIES.map((difficulty) => {
    return `| ${difficulty} | ${matrix[difficulty].portfolio} | ${matrix[difficulty].risk} | ${matrix[difficulty].market} | ${matrix[difficulty].rebalance} | ${matrix[difficulty].stress} | ${matrix[difficulty].multi} |`;
  });
  const scenarioLine = `scenario_counts: risk=${scenarioCategoryCounts.risk}, persona=${scenarioCategoryCounts.persona}, edge_case=${scenarioCategoryCounts.edge_case}, attack=${scenarioCategoryCounts.attack}, workflow=${scenarioCategoryCounts.workflow}`;
  const emptyLine =
    emptyCells.length > 0
      ? `empty_cells: ${emptyCells.join(', ')}`
      : 'empty_cells: none';

  return [header, divider, ...rows, scenarioLine, emptyLine].join('\n');
}
