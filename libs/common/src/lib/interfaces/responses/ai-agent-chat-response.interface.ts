export type AiAgentToolName =
  | 'portfolio_analysis'
  | 'risk_assessment'
  | 'market_data_lookup'
  | 'rebalance_plan'
  | 'stress_test'
  | 'get_portfolio_summary'
  | 'get_current_holdings'
  | 'get_portfolio_risk_metrics'
  | 'get_recent_transactions'
  | 'get_live_quote'
  | 'get_asset_fundamentals'
  | 'get_financial_news'
  | 'account_overview'
  | 'exchange_rate'
  | 'price_history'
  | 'symbol_lookup'
  | 'market_benchmarks'
  | 'activity_history'
  | 'demo_data'
  | 'create_account'
  | 'create_order'
  | 'calculate_rebalance_plan'
  | 'simulate_trade_impact'
  | 'transaction_categorize'
  | 'tax_estimate'
  | 'compliance_check';

export type AiAgentConfidenceBand = 'high' | 'medium' | 'low';

export interface AiAgentCitation {
  confidence: number;
  snippet: string;
  source: AiAgentToolName;
}

export interface AiAgentConfidence {
  band: AiAgentConfidenceBand;
  score: number;
}

export interface AiAgentVerificationCheck {
  check: string;
  details: string;
  status: 'passed' | 'warning' | 'failed';
}

export interface AiAgentToolCall {
  durationInMs?: number;
  input: Record<string, unknown>;
  outputSummary: string;
  status: 'success' | 'failed';
  tool: AiAgentToolName;
}

export interface AiAgentMemorySnapshot {
  sessionId: string;
  turns: number;
}

export interface AiAgentTokenEstimate {
  input: number;
  output: number;
  total: number;
}

export interface AiAgentLlmInvocation {
  model: string;
  provider: string;
}

export interface AiAgentLatencyBreakdown {
  llmGenerationInMs: number;
  memoryReadInMs: number;
  memoryWriteInMs: number;
  toolExecutionInMs: number;
}

export interface AiAgentObservabilitySnapshot {
  latencyBreakdownInMs: AiAgentLatencyBreakdown;
  latencyInMs: number;
  llmInvocation?: AiAgentLlmInvocation;
  tokenEstimate: AiAgentTokenEstimate;
  traceId?: string;
}

export interface AiAgentFeedbackResponse {
  accepted: boolean;
  feedbackId: string;
}

export interface AiAgentChatResponse {
  answer: string;
  citations: AiAgentCitation[];
  llmInvocation?: AiAgentLlmInvocation;
  confidence: AiAgentConfidence;
  memory: AiAgentMemorySnapshot;
  observability?: AiAgentObservabilitySnapshot;
  toolCalls: AiAgentToolCall[];
  verification: AiAgentVerificationCheck[];
}
