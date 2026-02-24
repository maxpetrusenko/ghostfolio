import { AI_AGENT_MVP_EVAL_DATASET } from './mvp-eval.dataset';
import {
  buildScenarioCoverageMatrix,
  deriveScenarioLabels,
  formatScenarioCoverageTable,
  SCENARIO_DIFFICULTIES,
  SCENARIO_TOOL_BUCKETS
} from './mvp-eval.coverage';

describe('AiAgentMvpEvalCoverage', () => {
  it('assigns scenario labels to each eval case', () => {
    for (const evalCase of AI_AGENT_MVP_EVAL_DATASET) {
      const labels = deriveScenarioLabels({
        category: evalCase.category,
        expected: evalCase.expected,
        input: evalCase.input,
        intent: evalCase.intent
      });
      expect(labels).toBeDefined();
      expect(labels.category).toBeDefined();
      expect(labels.difficulty).toBeDefined();
      expect(labels.toolBucket).toBeDefined();
      expect(labels.tags.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('covers required scenario categories from the escalation policy', () => {
    const { scenarioCategoryCounts } = buildScenarioCoverageMatrix({
      cases: AI_AGENT_MVP_EVAL_DATASET
    });

    expect(scenarioCategoryCounts.risk).toBeGreaterThan(0);
    expect(scenarioCategoryCounts.persona).toBeGreaterThan(0);
    expect(scenarioCategoryCounts.edge_case).toBeGreaterThan(0);
    expect(scenarioCategoryCounts.attack).toBeGreaterThan(0);
  });

  it('builds a difficulty-by-tool coverage matrix with deterministic shape', () => {
    const { matrix } = buildScenarioCoverageMatrix({
      cases: AI_AGENT_MVP_EVAL_DATASET
    });

    for (const difficulty of SCENARIO_DIFFICULTIES) {
      for (const toolBucket of [...SCENARIO_TOOL_BUCKETS, 'none']) {
        expect(matrix[difficulty][toolBucket]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('formats a table report with explicit empty-cell hints', () => {
    const table = formatScenarioCoverageTable({
      cases: AI_AGENT_MVP_EVAL_DATASET
    });

    expect(table).toContain('| difficulty | portfolio | risk | market | rebalance | stress | multi |');
    expect(table).toContain('scenario_counts:');
    expect(table).toContain('empty_cells:');
  });
});
