import { RebalancePlanner } from './ai-agent.rebalance-planner';
import { ToolFacts } from './ai-agent.response-contract';

describe('RebalancePlanner', () => {
  describe('generatePlan', () => {
    it('should create no trades when portfolio is well-diversified', () => {
      const facts: ToolFacts = {
        allocations: [
          { symbol: 'AAPL', allocationInPercentage: 20.0 },
          { symbol: 'GOOGL', allocationInPercentage: 20.0 },
          { symbol: 'MSFT', allocationInPercentage: 20.0 },
          { symbol: 'TSLA', allocationInPercentage: 20.0 },
          { symbol: 'AMZN', allocationInPercentage: 20.0 }
        ],
        top_allocation_percentage: 20.0,
        concentration_band: 'low',
        risk_flags: [],
        tools_used: ['portfolio_analysis'],
        data_sources: [],
        execution_latency_ms: 1000,
        portfolio_value: 100000,
        holdings_count: 5
      };

      const plan = RebalancePlanner.generatePlan(facts);

      expect(plan.trades).toHaveLength(0);
      expect(plan.target_allocations).toEqual({
        'AAPL': 20.0,
        'GOOGL': 20.0,
        'MSFT': 20.0,
        'TSLA': 20.0,
        'AMZN': 20.0
      });
      expect(plan.max_top_allocation).toBe(25);
      expect(plan.diversification_target).toBe('even_distribution');
    });

    it('should create sell trade for top holding over 25%', () => {
      const facts: ToolFacts = {
        allocations: [
          { symbol: 'AAPL', allocationInPercentage: 35.0 },
          { symbol: 'GOOGL', allocationInPercentage: 21.7 },
          { symbol: 'MSFT', allocationInPercentage: 21.7 },
          { symbol: 'TSLA', allocationInPercentage: 21.6 }
        ],
        top_allocation_percentage: 35.0,
        concentration_band: 'high',
        risk_flags: ['high_concentration'],
        tools_used: ['portfolio_analysis'],
        data_sources: [],
        execution_latency_ms: 1000,
        portfolio_value: 100000,
        holdings_count: 4
      };

      const plan = RebalancePlanner.generatePlan(facts);

      expect(plan.trades).toHaveLength(4);

      const sellTrade = plan.trades.find(t => t.symbol === 'AAPL' && t.action === 'sell');
      expect(sellTrade).toBeDefined();
      expect(sellTrade?.current_allocation).toBe(35.0);
      expect(sellTrade?.target_allocation).toBe(25.0);
      expect(sellTrade?.allocation_delta).toBe(-10.0);

      const buyTrades = plan.trades.filter(t => t.action === 'buy');
      expect(buyTrades).toHaveLength(3);
      expect(buyTrades[0].allocation_delta).toBeGreaterThan(0);
    });

    it('should create equal redistribution of excess', () => {
      const facts: ToolFacts = {
        allocations: [
          { symbol: 'AAPL', allocationInPercentage: 45.0 },
          { symbol: 'GOOGL', allocationInPercentage: 18.3 },
          { symbol: 'MSFT', allocationInPercentage: 18.4 },
          { symbol: 'TSLA', allocationInPercentage: 18.3 }
        ],
        top_allocation_percentage: 45.0,
        concentration_band: 'high',
        risk_flags: ['high_concentration'],
        tools_used: ['portfolio_analysis'],
        data_sources: [],
        execution_latency_ms: 1000,
        portfolio_value: 100000,
        holdings_count: 4
      };

      const plan = RebalancePlanner.generatePlan(facts);

      // Excess = 45 - 25 = 20%
      // Each of 3 other holdings should get ~6.67%
      const buyTrades = plan.trades.filter(t => t.action === 'buy');
      expect(buyTrades).toHaveLength(3);

      // Check that trades are approximately equal (allowing for rounding)
      const deltas = buyTrades.map(t => t.allocation_delta);
      const avgDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
      const variance = deltas.reduce((sum, d) => sum + Math.pow(d - avgDelta, 2), 0) / deltas.length;

      // Variance should be very small (all deltas should be ~6.67)
      expect(variance).toBeLessThan(0.1);

      // Target allocations should sum to 100%
      const totalTarget = Object.values(plan.target_allocations).reduce((sum, val) => sum + val, 0);
      expect(totalTarget).toBe(100);
    });

    it('should handle edge case with small allocations', () => {
      const facts: ToolFacts = {
        allocations: [
          { symbol: 'AAPL', allocationInPercentage: 50.0 },
          { symbol: 'GOOGL', allocationInPercentage: 25.0 },
          { symbol: 'MSFT', allocationInPercentage: 15.0 },
          { symbol: 'TSLA', allocationInPercentage: 10.0 }
        ],
        top_allocation_percentage: 50.0,
        concentration_band: 'high',
        risk_flags: ['high_concentration'],
        tools_used: ['portfolio_analysis'],
        data_sources: [],
        execution_latency_ms: 1000,
        portfolio_value: 100000,
        holdings_count: 4
      };

      const plan = RebalancePlanner.generatePlan(facts);

      // AAPL should be reduced to 25%
      expect(plan.target_allocations['AAPL']).toBe(25);

      // Other holdings should get increases, but not exceed reasonable bounds
      expect(plan.target_allocations['GOOGL']).toBeGreaterThan(25);
      expect(plan.target_allocations['MSFT']).toBeGreaterThan(15);
      expect(plan.target_allocations['TSLA']).toBeGreaterThan(10);

      // Total should be exactly 100%
      const total = Object.values(plan.target_allocations).reduce((sum, val) => sum + val, 0);
      expect(total).toBe(100);
    });

    it('should filter out tiny trades (< 0.1%)', () => {
      const facts: ToolFacts = {
        allocations: [
          { symbol: 'AAPL', allocationInPercentage: 30.0 },
          { symbol: 'GOOGL', allocationInPercentage: 23.3 },
          { symbol: 'MSFT', allocationInPercentage: 23.3 },
          { symbol: 'TSLA', allocationInPercentage: 23.4 }
        ],
        top_allocation_percentage: 30.0,
        concentration_band: 'medium',
        risk_flags: ['moderate_concentration'],
        tools_used: ['portfolio_analysis'],
        data_sources: [],
        execution_latency_ms: 1000,
        portfolio_value: 100000,
        holdings_count: 4
      };

      const plan = RebalancePlanner.generatePlan(facts);

      // Excess = 30 - 25 = 5%
      // Equal share = 5 / 3 = 1.67% each
      // Some tiny allocations might be filtered out
      expect(plan.trades.length).toBeLessThanOrEqual(4);

      // All actual trades should be > 0.1%
      plan.trades.forEach(trade => {
        expect(Math.abs(trade.allocation_delta)).toBeGreaterThan(0.1);
      });
    });

    it('should normalize allocations correctly after redistribution', () => {
      const facts: ToolFacts = {
        allocations: [
          { symbol: 'AAPL', allocationInPercentage: 40.0 },
          { symbol: 'GOOGL', allocationInPercentage: 30.0 },
          { symbol: 'MSFT', allocationInPercentage: 20.0 },
          { symbol: 'TSLA', allocationInPercentage: 10.0 }
        ],
        top_allocation_percentage: 40.0,
        concentration_band: 'high',
        risk_flags: ['high_concentration'],
        tools_used: ['portfolio_analysis'],
        data_sources: [],
        execution_latency_ms: 1000,
        portfolio_value: 100000,
        holdings_count: 4
      };

      const plan = RebalancePlanner.generatePlan(facts);

      // After redistribution, total should be exactly 100%
      const total = Object.values(plan.target_allocations).reduce((sum, val) => sum + val, 0);
      expect(total).toBe(100);

      // AAPL should be capped at 25%
      expect(plan.target_allocations['AAPL']).toBe(25);

      // Other allocations should sum to 75%
      const otherTotal = Object.entries(plan.target_allocations)
        .filter(([symbol]) => symbol !== 'AAPL')
        .reduce((sum, [, val]) => sum + val, 0);
      expect(otherTotal).toBe(75);
    });
  });
});
