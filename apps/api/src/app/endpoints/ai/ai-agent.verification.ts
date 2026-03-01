import { ToolFacts, RebalancePlan, VerificationReport } from './ai-agent.response-contract';

export class VerificationMiddleware {
  /**
   * Verify facts and plan consistency
   */
  static verifyFactsAndPlan(facts: ToolFacts, plan: RebalancePlan): VerificationReport {
    const checks = [
      // Critical checks
      this.checkAllocationsSum(facts.allocations),
      this.checkPlanTargetsSum(plan.target_allocations),
      this.checkNoNegativeTargets(plan.target_allocations),
      this.checkTradeDirectionsConsistent(plan.trades),
      this.checkSymbolsResolved(facts.allocations, Object.keys(plan.target_allocations)),

      // Warning checks
      this.checkConcentrationImprovement(facts, plan),
      this.checkPlanHasTrades(plan),
      this.checkExecutionLatency(facts.execution_latency_ms)
    ];

    const criticalChecks = checks.filter(c => c.severity === 'critical');
    const warningChecks = checks.filter(c => c.severity === 'warning');

    const passedCritical = criticalChecks.filter(c => c.passed).length;
    const passedWarnings = warningChecks.filter(c => c.passed).length;

    // Determine status
    let status: 'passed' | 'partial' | 'failed' = 'passed';
    if (passedCritical < criticalChecks.length) {
      status = 'failed';
    } else if (passedWarnings < warningChecks.length) {
      status = 'partial';
    }

    // Calculate confidence score
    const confidence = this.calculateConfidence(
      passedCritical,
      criticalChecks.length,
      passedWarnings,
      warningChecks.length
    );

    return {
      status,
      confidence_score: confidence,
      checks: [...criticalChecks, ...warningChecks],
      summary: {
        critical_checks: criticalChecks.length,
        passed_critical: passedCritical,
        warning_checks: warningChecks.length,
        passed_warnings: passedWarnings
      }
    };
  }

  private static checkAllocationsSum(allocations: ToolFacts['allocations']) {
    const sum = allocations.reduce((total, alloc) => total + alloc.allocationInPercentage, 0);
    const normalizedSum = Math.round(sum * 100) / 100;
    const passed = Math.abs(normalizedSum - 100) <= 0.5;

    return {
      name: 'allocations_sum_100',
      passed,
      severity: 'critical' as const,
      message: passed
        ? `Allocations sum to ${normalizedSum.toFixed(1)}% (±0.5%)`
        : `Allocations sum to ${normalizedSum.toFixed(1)}%, expected 100%`
    };
  }

  private static checkPlanTargetsSum(targetAllocations: Record<string, number>) {
    const sum = Object.values(targetAllocations).reduce((total, val) => total + val, 0);
    const normalizedSum = Math.round(sum * 100) / 100;
    const passed = Math.abs(normalizedSum - 100) <= 0.5;

    return {
      name: 'plan_targets_sum_100',
      passed,
      severity: 'critical' as const,
      message: passed
        ? `Plan targets sum to ${normalizedSum.toFixed(1)}% (±0.5%)`
        : `Plan targets sum to ${normalizedSum.toFixed(1)}%, expected 100%`
    };
  }

  private static checkNoNegativeTargets(targetAllocations: Record<string, number>) {
    const negativeTargets = Object.entries(targetAllocations)
      .filter(([, value]) => value < 0);

    return {
      name: 'no_negative_targets',
      passed: negativeTargets.length === 0,
      severity: 'critical' as const,
      message: negativeTargets.length === 0
        ? 'No negative target allocations'
        : `Negative targets found: ${negativeTargets.map(([s, v]) => `${s}: ${v}%`).join(', ')}`
    };
  }

  private static checkTradeDirectionsConsistent(trades: RebalancePlan['trades']) {
    const inconsistentTrades = trades.filter(trade => {
      if (trade.action === 'sell' && trade.allocation_delta > 0) return true;
      if (trade.action === 'buy' && trade.allocation_delta < 0) return true;
      return false;
    });

    return {
      name: 'trade_directions_consistent',
      passed: inconsistentTrades.length === 0,
      severity: 'critical' as const,
      message: inconsistentTrades.length === 0
        ? 'All trade directions are consistent'
        : `Inconsistent trade directions: ${inconsistentTrades.map(t => `${t.symbol}:${t.action}`).join(', ')}`
    };
  }

  private static checkSymbolsResolved(allocations: ToolFacts['allocations'], planSymbols: string[]) {
    const allocationSymbols = allocations.map(a => a.symbol);
    const unresolved = planSymbols.filter(symbol => !allocationSymbols.includes(symbol));

    return {
      name: 'symbols_resolved',
      passed: unresolved.length === 0,
      severity: 'warning' as const, // Allow for new symbols being added
      message: unresolved.length === 0
        ? 'All plan symbols resolved in facts'
        : `Unresolved symbols in plan: ${unresolved.join(', ')}`
    };
  }

  private static checkConcentrationImprovement(facts: ToolFacts, plan: RebalancePlan) {
    const currentTop = facts.top_allocation_percentage;
    const targetTop = Math.max(...Object.values(plan.target_allocations));

    const improved = targetTop < currentTop;

    return {
      name: 'concentration_improves',
      passed: improved,
      severity: 'warning' as const,
      message: improved
        ? `Top allocation improved from ${currentTop.toFixed(1)}% to ${targetTop.toFixed(1)}%`
        : `Top allocation did not improve (${currentTop.toFixed(1)}% → ${targetTop.toFixed(1)}%)`
    };
  }

  private static checkPlanHasTrades(plan: RebalancePlan) {
    return {
      name: 'plan_has_trades',
      passed: plan.trades.length > 0,
      severity: 'warning' as const,
      message: plan.trades.length > 0
        ? `Plan has ${plan.trades.length} rebalance trades`
        : 'No rebalance trades needed'
    };
  }

  private static checkExecutionLatency(latencyMs: number) {
    const fastExecution = latencyMs < 5000; // 5 seconds

    return {
      name: 'execution_latency',
      passed: fastExecution,
      severity: 'warning' as const,
      message: fastExecution
        ? `Tools executed in ${latencyMs}ms`
        : `Tools took ${latencyMs}ms (consider optimization)`
    };
  }

  private static calculateConfidence(
    passedCritical: number,
    totalCritical: number,
    passedWarnings: number,
    totalWarnings: number
  ): number {
    // Base confidence from critical checks
    const criticalConfidence = totalCritical > 0 ? passedCritical / totalCritical : 1;

    // Penalty for warnings
    const warningPenalty = totalWarnings > 0 ? (totalWarnings - passedWarnings) * 0.05 : 0;

    // Penalty for failed critical checks
    const criticalPenalty = totalCritical - passedCritical > 0 ? 0.3 : 0;

    const confidence = Math.max(0, Math.min(1, criticalConfidence - warningPenalty - criticalPenalty));

    return Math.round(confidence * 100) / 100;
  }
}
