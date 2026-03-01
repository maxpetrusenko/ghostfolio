export type AiAgentToolName =
  | 'portfolio_analysis'
  | 'risk_assessment'
  | 'market_data_lookup'
  | 'rebalance_plan'
  | 'stress_test'
  | 'fire_analysis'
  | 'account_overview'
  | 'exchange_rate'
  | 'get_portfolio_summary'
  | 'get_current_holdings'
  | 'get_portfolio_risk_metrics'
  | 'get_recent_transactions'
  | 'get_live_quote'
  | 'get_asset_fundamentals'
  | 'get_financial_news'
  | 'price_history'
  | 'symbol_lookup'
  | 'market_benchmarks'
  | 'activity_history'
  | 'demo_data'
  | 'create_account'
  | 'create_order'
  | 'seed_funds'
  | 'calculate_rebalance_plan'
  | 'simulate_trade_impact'
  | 'transaction_categorize'
  | 'tax_estimate'
  | 'compliance_check'
  // Broker Statement Ingestion (AgentForge Bounty)
  | 'import_broker_statement'
  | 'list_statement_imports'
  | 'get_statement_import_details'
  | 'set_symbol_mapping'
  | 'list_symbol_mappings'
  | 'run_reconciliation'
  | 'get_reconciliation_result'
  | 'apply_reconciliation_fix';

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
  state?: Record<string, unknown>;
  outputSummary: string;
  status: 'success' | 'failed';
  tool: AiAgentToolName;
}

export interface AiAgentChatMessage {
  content: string;
  role: 'assistant' | 'system' | 'user';
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
  costEstimateUsd?: number;
  latencyBreakdownInMs: AiAgentLatencyBreakdown;
  latencyInMs: number;
  llmInvocation?: AiAgentLlmInvocation;
  tokenEstimate: AiAgentTokenEstimate;
  toolStepMetrics?: {
    durationInMs?: number;
    status: 'success' | 'failed';
    tool: AiAgentToolName;
  }[];
  traceId?: string;
}

export interface AiAgentFeedbackResponse {
  accepted: boolean;
  feedbackId: string;
}

export interface AiAgentChatRequest {
  languageCode: string;
  query: string;
  conversationId?: string;
  sessionId?: string;
  symbols?: string[];
  model?: string;
  nextResponsePreference?: string;
  userCurrency: string;
  userId: string;
}

export interface AgentKernel {
  run(request: AiAgentChatRequest): Promise<AiAgentChatResponse>;
}

export interface AiAgentChatResponse {
  answer: string;
  citations: AiAgentCitation[];
  llmInvocation?: AiAgentLlmInvocation;
  confidence: AiAgentConfidence;
  escalation?: {
    reason: string;
    required: boolean;
    suggestedAction: string;
  };
  memory: AiAgentMemorySnapshot;
  observability?: AiAgentObservabilitySnapshot;
  toolCalls: AiAgentToolCall[];
  verification: AiAgentVerificationCheck[];
}
