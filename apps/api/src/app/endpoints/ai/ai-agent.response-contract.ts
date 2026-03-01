import { AiAgentToolCall } from './ai-agent.interfaces';

// Strict data contracts - no prose, only facts
export interface ToolFacts {
  // Portfolio facts
  allocations: {
    symbol: string;
    name?: string;
    allocationInPercentage: number;
    valueInBaseCurrency?: number;
  }[];

  top_allocation_percentage: number;
  portfolio_value?: number;
  holdings_count: number;

  // Risk facts
  concentration_band: 'high' | 'medium' | 'low';
  hhi_score?: number; // Herfindahl-Hirschman Index
  risk_flags: string[];

  // Metadata
  tools_used: string[];
  data_sources: string[];
  execution_latency_ms: number;
}

export interface RebalancePlan {
  target_allocations: Record<string, number>; // symbol -> percentage
  trades: {
    symbol: string;
    action: 'buy' | 'sell';
    current_allocation: number;
    target_allocation: number;
    allocation_delta: number;
  }[];

  // Constraints
  max_top_allocation?: number;
  diversification_target?: string;
}

export interface VerificationReport {
  status: 'passed' | 'partial' | 'failed';
  confidence_score: number;
  checks: {
    name: string;
    passed: boolean;
    severity: 'critical' | 'warning';
    message: string;
  }[];

  summary: {
    critical_checks: number;
    passed_critical: number;
    warning_checks: number;
    passed_warnings: number;
  };
}

export interface FinalResponse {
  narrative: string;
  action_items: string[];
  risk_explanation: string;
  next_steps: string[];
  confidence_emoji: '🟢' | '🟡' | '🔴';
}

// Full debug payload
export interface DebugPayload {
  facts: ToolFacts;
  plan: RebalancePlan;
  verification: VerificationReport;
  final: FinalResponse;
  original_tool_calls: AiAgentToolCall[];
}

// Response contract types
export type ConcentrationAnalysisResponse =
  | { type: 'strict'; payload: ToolFacts & { plan: RebalancePlan; verification: VerificationReport } }
  | { type: 'rendered'; payload: FinalResponse }
  | { type: 'debug'; payload: DebugPayload };
