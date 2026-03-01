import { ToolFacts, RebalancePlan, VerificationReport, FinalResponse } from './ai-agent.response-contract';

export class HumanRenderer {
  /**
   * Render strict data into user-friendly response
   * LLM with strict constraints to avoid hallucination
   */
  static async renderResponse(
    facts: ToolFacts,
    plan: RebalancePlan,
    verification: VerificationReport
  ): Promise<FinalResponse> {
    const confidenceEmoji = this.getConfidenceEmoji(verification.confidence_score);

    // Build prompt with strict constraints
    this.buildRenderPrompt(facts, plan, verification);

    // In production, this would call an LLM with the prompt
    // For now, we'll use a deterministic renderer that respects the constraints
    const response = this.deterministicRender(facts, plan, verification, confidenceEmoji);

    return response;
  }

  private static getConfidenceEmoji(confidence: number): '🟢' | '🟡' | '🔴' {
    if (confidence >= 0.8) return '🟢';
    if (confidence >= 0.6) return '🟡';
    return '🔴';
  }

  private static buildRenderPrompt(
    facts: ToolFacts,
    plan: RebalancePlan,
    verification: VerificationReport
  ): string {
    return `
You are a financial advisor explaining portfolio rebalancing.

STRICT RULES:
1. ONLY use numbers and facts from the JSON below
2. DO NOT invent numbers, percentages, or recommendations
3. If information is missing, say "unknown"
4. DO NOT add personal opinions or external knowledge

JSON INPUT:
${JSON.stringify({ facts, plan, verification }, null, 2)}

RESPONSE FORMAT:
{
  "narrative": "Brief explanation using EXACT numbers from JSON",
  "action_items": ["Specific action 1", "Specific action 2"],
  "risk_explanation": "Risk explanation using EXACT numbers",
  "next_steps": ["Step 1", "Step 2"]
}

RESPOND WITH JSON ONLY. NO EXPLANATION OUTSIDE JSON.
`;
  }

  private static deterministicRender(
    facts: ToolFacts,
    plan: RebalancePlan,
    verification: VerificationReport,
    confidenceEmoji: '🟢' | '🟡' | '🔴'
  ): FinalResponse {
    const topHolding = facts.allocations.reduce((max, current) =>
      current.allocationInPercentage > max.allocationInPercentage ? current : max
    );

    const riskExplanation = this.buildRiskExplanation(facts);
    const actionItems = this.buildActionItems(plan, facts);
    const nextSteps = this.buildNextSteps(verification, plan);

    return {
      narrative: `${confidenceEmoji} Your portfolio has a ${facts.concentration_band} concentration with your top holding (${topHolding.symbol}) at ${facts.top_allocation_percentage.toFixed(1)}%.`,
      action_items: actionItems,
      risk_explanation: riskExplanation,
      next_steps: nextSteps,
      confidence_emoji: confidenceEmoji
    };
  }

  private static buildRiskExplanation(facts: ToolFacts): string {
    const explanations: string[] = [];

    if (facts.concentration_band === 'high') {
      explanations.push(`High concentration detected: ${facts.top_allocation_percentage.toFixed(1)}% in top holding`);
    } else if (facts.concentration_band === 'medium') {
      explanations.push(`Moderate concentration: ${facts.top_allocation_percentage.toFixed(1)}% in top holding`);
    }

    if (facts.hhi_score && facts.hhi_score > 2500) {
      explanations.push(`HHI score of ${facts.hhi_score} indicates high market concentration`);
    }

    if (facts.risk_flags.length > 0) {
      explanations.push(`Risk flags: ${facts.risk_flags.join(', ')}`);
    }

    return explanations.length > 0 ? explanations.join('. ') : 'Portfolio concentration appears within normal ranges.';
  }

  private static buildActionItems(plan: RebalancePlan, facts: ToolFacts): string[] {
    const actions: string[] = [];

    if (plan.trades.length === 0) {
      actions.push('No rebalancing needed - portfolio is well-diversified');
    } else {
      actions.push(`Rebalance to reduce top allocation from ${facts.top_allocation_percentage.toFixed(1)}% to ${Math.max(...Object.values(plan.target_allocations)).toFixed(1)}%`);

      const sellTrades = plan.trades.filter(t => t.action === 'sell');
      const buyTrades = plan.trades.filter(t => t.action === 'buy');

      if (sellTrades.length > 0) {
        const topSell = sellTrades.reduce((max, trade) =>
          trade.allocation_delta < max.allocation_delta ? trade : max
        );
        actions.push(`Sell ${Math.abs(topSell.allocation_delta).toFixed(1)}% of ${topSell.symbol}`);
      }

      if (buyTrades.length > 0) {
        const topBuy = buyTrades.reduce((max, trade) =>
          trade.allocation_delta > max.allocation_delta ? trade : max
        );
        actions.push(`Buy ${topBuy.allocation_delta.toFixed(1)}% of ${topBuy.symbol}`);
      }
    }

    actions.push('Review quarterly to maintain diversification');

    return actions;
  }

  private static buildNextSteps(verification: VerificationReport, plan: RebalancePlan): string[] {
    const steps: string[] = [];

    if (verification.status === 'failed') {
      steps.push('⚠️ System verification failed - review inputs and try again');
    } else if (verification.status === 'partial') {
      steps.push('⚠️ Some checks failed - review results carefully');
    } else {
      steps.push('✅ Plan verified - safe to proceed with rebalancing');
    }

    if (plan.trades.length > 0) {
      steps.push('Execute trades gradually to minimize market impact');
      steps.push('Consider tax implications for taxable accounts');
    }

    steps.push('Monitor portfolio concentration over time');
    steps.push('Set up alerts for concentration thresholds');

    return steps;
  }
}
