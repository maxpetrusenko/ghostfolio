import {
  PortfolioAnalysisResult,
  RiskAssessmentResult,
} from './ai-agent.chat.interfaces';
import { AiAgentToolName } from './ai-agent.interfaces';
import { ToolFacts } from './ai-agent.response-contract';

interface FireAnalysisResult {
  status?: 'feasible' | 'infeasible';
}

export interface FactsAggregatorToolCall {
  citations?: unknown[];
  executionLatency?: number;
  result?: unknown;
  toolName: AiAgentToolName;
}

export class FactsAggregator {
  /**
   * Extract strict facts from tool outputs, stripping all prose
   */
  static aggregateFacts(toolCalls: FactsAggregatorToolCall[]): ToolFacts {
    const facts: Partial<ToolFacts> = {
      allocations: [],
      risk_flags: [],
      tools_used: [],
      data_sources: [],
      execution_latency_ms: 0,
    };

    let maxAllocation = 0;
    let allocationsSum = 0;

    // Process each tool call result
    toolCalls.forEach(call => {
      facts.tools_used.push(call.toolName);

      switch (call.toolName) {
        case 'portfolio_analysis':
          this.processPortfolioAnalysis(call.result as PortfolioAnalysisResult, facts);
          maxAllocation = Math.max(maxAllocation, ...(facts.allocations?.map(a => a.allocationInPercentage) || [0]));
          allocationsSum = facts.allocations?.reduce((sum, a) => sum + a.allocationInPercentage, 0) || 0;
          break;

        case 'get_portfolio_summary': {
          const summary = call.result as any;
          if (summary.totalValueInBaseCurrency) {
            facts.portfolio_value = summary.totalValueInBaseCurrency;
          }
          if (summary.holdingsCount) {
            facts.holdings_count = summary.holdingsCount;
          }
          break;
        }

        case 'risk_assessment':
          this.processRiskAssessment(call.result as RiskAssessmentResult, facts);
          break;

        case 'rebalance_plan':
          // Rebalance plan goes to plan, not facts
          break;

        case 'fire_analysis':
          this.processFireAnalysis(call.result as FireAnalysisResult, facts);
          break;

        case 'get_live_quote':
        case 'symbol_lookup':
          facts.data_sources.push(call.toolName);
          break;
      }

      // Track execution latency
      if (call.executionLatency) {
        facts.execution_latency_ms += call.executionLatency;
      }
    });

    // Set derived facts
    facts.top_allocation_percentage = maxAllocation;
    facts.concentration_band = this.calculateConcentrationBand(maxAllocation, allocationsSum);

    return facts as ToolFacts;
  }

  private static processPortfolioAnalysis(result: PortfolioAnalysisResult, facts: Partial<ToolFacts>) {
    facts.allocations = result.holdings.map(holding => ({
      symbol: holding.symbol,
      name: holding.name,
      allocationInPercentage: holding.allocationInPercentage,
      valueInBaseCurrency: holding.valueInBaseCurrency,
    }));
  }

  private static processRiskAssessment(result: RiskAssessmentResult, facts: Partial<ToolFacts>) {
    facts.concentration_band = result.concentrationBand;
    facts.hhi_score = result.hhi;

    // Add risk flags based on concentration
    if (result.concentrationBand === 'high') {
      facts.risk_flags.push('high_concentration');
    }
    if (result.concentrationBand === 'medium') {
      facts.risk_flags.push('moderate_concentration');
    }

    if (result.topHoldingAllocation > 30) {
      facts.risk_flags.push('single_holding_over_30');
    }
  }

  private static processFireAnalysis(result: FireAnalysisResult, facts: Partial<ToolFacts>) {
    // Extract any relevant facts, but don't mix in FIRE analysis as risk flags
    if (result.status === 'infeasible') {
      facts.risk_flags.push('fire_infeasible');
    }
  }

  private static calculateConcentrationBand(maxAllocation: number, totalAllocations: number): 'high' | 'medium' | 'low' {
    // Normalize allocation sum (handle floating point precision)
    const normalizedSum = Math.round(totalAllocations * 100) / 100;

    // If allocations don't sum to ~100%, we have incomplete data
    if (Math.abs(normalizedSum - 100) > 1) {
      return 'medium'; // Conservative default
    }

    if (maxAllocation > 40) return 'high';
    if (maxAllocation > 25) return 'medium';
    return 'low';
  }
}
