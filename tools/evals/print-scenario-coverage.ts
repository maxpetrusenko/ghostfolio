import { AI_AGENT_MVP_EVAL_DATASET } from '../../apps/api/src/app/endpoints/ai/evals/mvp-eval.dataset';
import { formatScenarioCoverageTable } from '../../apps/api/src/app/endpoints/ai/evals/mvp-eval.coverage';

const table = formatScenarioCoverageTable({
  cases: AI_AGENT_MVP_EVAL_DATASET
});

console.log('Labeled scenario coverage matrix');
console.log(table);
