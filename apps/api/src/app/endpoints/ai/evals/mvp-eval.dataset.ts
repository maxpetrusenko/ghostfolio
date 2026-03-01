import { ADVERSARIAL_EVAL_CASES } from './dataset/adversarial.dataset';
import {
  BROKER_ADVERSARIAL_CASES,
  BROKER_EDGE_CASES,
  BROKER_STATEMENT_EVAL_CASES
} from './dataset/broker-statement.dataset';
import { EDGE_CASE_EVAL_CASES } from './dataset/edge-case.dataset';
import { HAPPY_PATH_EVAL_CASES } from './dataset/happy-path.dataset';
import { MULTI_STEP_EVAL_CASES } from './dataset/multi-step.dataset';
import { AiAgentMvpEvalCase } from './mvp-eval.interfaces';

export const AI_AGENT_MVP_EVAL_DATASET: AiAgentMvpEvalCase[] = [
  ...HAPPY_PATH_EVAL_CASES,
  ...EDGE_CASE_EVAL_CASES,
  ...ADVERSARIAL_EVAL_CASES,
  ...MULTI_STEP_EVAL_CASES,
  ...BROKER_STATEMENT_EVAL_CASES,
  ...BROKER_ADVERSARIAL_CASES,
  ...BROKER_EDGE_CASES
];
