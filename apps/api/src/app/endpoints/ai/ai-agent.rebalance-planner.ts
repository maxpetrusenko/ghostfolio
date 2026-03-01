import { ToolFacts, RebalancePlan } from './ai-agent.response-contract';

export class RebalancePlanner {
  /**
   * Generate deterministic rebalance plan for concentration reduction
   * V0: Simple top allocation capping with equal redistribution
   */
  static generatePlan(facts: ToolFacts): RebalancePlan {
    const { allocations, top_allocation_percentage: currentTop } = facts;

    // V0 strategy: Cap top holding at 25%, redistribute excess equally
    const MAX_TOP_ALLOCATION = 25;
    const targetTopAllocation = Math.min(currentTop, MAX_TOP_ALLOCATION);

    // Identify top holding
    const topHolding = allocations.reduce((max, current) =>
      current.allocationInPercentage > max.allocationInPercentage ? current : max
    );

    if (!topHolding || topHolding.allocationInPercentage <= targetTopAllocation) {
      // No rebalancing needed
      return {
        target_allocations: this.mapToTargetAllocations(allocations),
        trades: [],
        max_top_allocation: MAX_TOP_ALLOCATION,
        diversification_target: 'even_distribution'
      };
    }

    // Calculate redistribution
    const excess = topHolding.allocationInPercentage - targetTopAllocation;
    const remainingHoldings = allocations.filter(h => h.symbol !== topHolding.symbol);
    const equalShare = remainingHoldings.length > 0 ? excess / remainingHoldings.length : 0;

    const targetAllocations: Record<string, number> = {};
    const trades: RebalancePlan['trades'] = [];

    // Build target allocations and trades
    allocations.forEach(holding => {
      let target = holding.allocationInPercentage;

      if (holding.symbol === topHolding.symbol) {
        target = targetTopAllocation;
        trades.push({
          symbol: holding.symbol,
          action: 'sell',
          current_allocation: holding.allocationInPercentage,
          target_allocation: target,
          allocation_delta: target - holding.allocationInPercentage
        });
      } else {
        target = Math.min(holding.allocationInPercentage + equalShare, holding.allocationInPercentage + excess * 0.5);
        if (Math.abs(target - holding.allocationInPercentage) > 0.1) {
          trades.push({
            symbol: holding.symbol,
            action: 'buy',
            current_allocation: holding.allocationInPercentage,
            target_allocation: target,
            allocation_delta: target - holding.allocationInPercentage
          });
        }
      }

      targetAllocations[holding.symbol] = Math.round(target * 100) / 100; // Round to 2 decimals
    });

    // Normalize to 100% (handle floating point precision)
    this.normalizeAllocations(targetAllocations);

    return {
      target_allocations: targetAllocations,
      trades: trades.filter(trade => Math.abs(trade.allocation_delta) > 0.1),
      max_top_allocation: MAX_TOP_ALLOCATION,
      diversification_target: 'even_distribution'
    };
  }

  /**
   * Map current allocations to target format
   */
  private static mapToTargetAllocations(allocations: ToolFacts['allocations']): Record<string, number> {
    const result: Record<string, number> = {};
    allocations.forEach(holding => {
      result[holding.symbol] = holding.allocationInPercentage;
    });
    return result;
  }

  /**
   * Normalize allocations to sum exactly 100%
   */
  private static normalizeAllocations(allocations: Record<string, number>) {
    const total = Object.values(allocations).reduce((sum, val) => sum + val, 0);
    const normalizedTotal = Math.round(total * 100) / 100;

    if (Math.abs(normalizedTotal - 100) > 0.01) {
      // Adjust the largest holding to compensate
      const largestSymbol = Object.entries(allocations).reduce((max, [symbol, value]) =>
        value > max.value ? { symbol, value } : max
      , { symbol: '', value: 0 });

      const adjustment = 100 - normalizedTotal;
      allocations[largestSymbol.symbol] = Math.round((allocations[largestSymbol.symbol] + adjustment) * 100) / 100;
    }
  }
}
