import { VerificationMiddleware } from './ai-agent.verification';
import { ToolFacts, RebalancePlan } from './ai-agent.response-contract';

describe('VerificationMiddleware', () => {
  describe('verifyFactsAndPlan', () => {
    const validFacts: ToolFacts = {
      allocations: [
        { symbol: 'AAPL', allocationInPercentage: 25.0, valueInBaseCurrency: 25000 },
        { symbol: 'GOOGL', allocationInPercentage: 25.0, valueInBaseCurrency: 25000 },
        { symbol: 'MSFT', allocationInPercentage: 25.0, valueInBaseCurrency: 25000 },
        { symbol: 'TSLA', allocationInPercentage: 25.0, valueInBaseCurrency: 25000 }
      ],
      top_allocation_percentage: 25.0,
      concentration_band: 'low',
      risk_flags: [],
      tools_used: ['portfolio_analysis'],
      data_sources: [],
      execution_latency_ms: 1000,
      portfolio_value: 100000,
      holdings_count: 4
    };

    const validPlan: RebalancePlan = {
      target_allocations: {
        'AAPL': 25.0,
        'GOOGL': 25.0,
        'MSFT': 25.0,
        'TSLA': 25.0
      },
      trades: [],
      max_top_allocation: 25,
      diversification_target: 'even_distribution'
    };

    it('should pass all checks for valid inputs', () => {
      const verification = VerificationMiddleware.verifyFactsAndPlan(validFacts, validPlan);

      expect(verification.status).toBe('partial');
      expect(verification.confidence_score).toBe(0.9);
      expect(verification.summary.critical_checks).toBe(4);
      expect(verification.summary.passed_critical).toBe(4);
      expect(verification.summary.warning_checks).toBe(4);
      expect(verification.summary.passed_warnings).toBe(2);
    });

    describe('Critical checks', () => {
      it('should fail when allocations do not sum to 100%', () => {
        const invalidFacts = {
          ...validFacts,
          allocations: [
            ...validFacts.allocations.slice(0, 3),
            { ...validFacts.allocations[3], allocationInPercentage: 26.0 }
          ]
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(invalidFacts, validPlan);

        expect(verification.status).toBe('failed');
        const allocationSumCheck = verification.checks.find(c => c.name === 'allocations_sum_100');
        expect(allocationSumCheck?.passed).toBe(false);
        expect(allocationSumCheck?.message).toContain('expected 100%');
      });

      it('should fail when plan targets do not sum to 100%', () => {
        const invalidPlan = {
          ...validPlan,
          target_allocations: {
            'AAPL': 26.0,
            'GOOGL': 25.0,
            'MSFT': 25.0,
            'TSLA': 23.0
          }
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(validFacts, invalidPlan);

        expect(verification.status).toBe('failed');
        const planSumCheck = verification.checks.find(c => c.name === 'plan_targets_sum_100');
        expect(planSumCheck?.passed).toBe(false);
      });

      it('should fail when negative targets exist', () => {
        const invalidPlan = {
          ...validPlan,
          target_allocations: {
            'AAPL': 30.0,
            'GOOGL': -5.0,
            'MSFT': 40.0,
            'TSLA': 35.0
          }
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(validFacts, invalidPlan);

        expect(verification.status).toBe('failed');
        const negativeTargetsCheck = verification.checks.find(c => c.name === 'no_negative_targets');
        expect(negativeTargetsCheck?.passed).toBe(false);
        expect(negativeTargetsCheck?.message).toContain('Negative targets found');
      });

      it('should fail when trade directions are inconsistent', () => {
        const invalidPlan: RebalancePlan = {
          ...validPlan,
          trades: [
            {
              symbol: 'AAPL',
              action: 'sell',
              current_allocation: 30.0,
              target_allocation: 25.0,
              allocation_delta: -5.0
            },
            {
              symbol: 'GOOGL',
              action: 'buy',
              current_allocation: 20.0,
              target_allocation: 15.0,
              allocation_delta: -5.0 // Inconsistent: buy action but negative delta
            }
          ]
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(validFacts, invalidPlan);

        expect(verification.status).toBe('failed');
        const tradeDirectionCheck = verification.checks.find(c => c.name === 'trade_directions_consistent');
        expect(tradeDirectionCheck?.passed).toBe(false);
      });

      it('should allow tolerance for floating point precision', () => {
        const factsWithRounding = {
          ...validFacts,
          allocations: validFacts.allocations.map((alloc, i) => ({
            ...alloc,
            allocationInPercentage: i === 0 ? 33.33 : 22.225 // Sums to 100.01 due to rounding
          }))
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(factsWithRounding, validPlan);

        // Should pass because 100.01% is within ±0.5% tolerance
        const allocationSumCheck = verification.checks.find(c => c.name === 'allocations_sum_100');
        expect(allocationSumCheck?.passed).toBe(true);
      });
    });

    describe('Warning checks', () => {
      it('should warn when concentration does not improve', () => {
        const factsWithHighConcentration = {
          ...validFacts,
          top_allocation_percentage: 40.0,
          allocations: [
            { ...validFacts.allocations[0], allocationInPercentage: 40.0 },
            ...validFacts.allocations.slice(1).map(alloc => ({
              ...alloc,
              allocationInPercentage: 20.0
            }))
          ]
        };

        // Plan that doesn't reduce top allocation
        const planWithoutImprovement = {
          ...validPlan,
          target_allocations: {
            'AAPL': 40.0, // Same as current
            'GOOGL': 20.0,
            'MSFT': 20.0,
            'TSLA': 20.0
          }
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(
          factsWithHighConcentration,
          planWithoutImprovement
        );

        expect(verification.status).toBe('partial'); // Some warnings failed
        const concentrationCheck = verification.checks.find(c => c.name === 'concentration_improves');
        expect(concentrationCheck?.passed).toBe(false);
        expect(concentrationCheck?.message).toContain('did not improve');
      });

      it('should pass when concentration improves', () => {
        const factsWithHighConcentration = {
          ...validFacts,
          top_allocation_percentage: 40.0,
          allocations: [
            { ...validFacts.allocations[0], allocationInPercentage: 40.0 },
            ...validFacts.allocations.slice(1).map(alloc => ({
              ...alloc,
              allocationInPercentage: 20.0
            }))
          ]
        };

        // Plan that reduces top allocation
        const planWithImprovement = {
          ...validPlan,
          target_allocations: {
            'AAPL': 25.0, // Reduced from 40%
            'GOOGL': 25.0,
            'MSFT': 25.0,
            'TSLA': 25.0
          }
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(
          factsWithHighConcentration,
          planWithImprovement
        );

        const concentrationCheck = verification.checks.find(c => c.name === 'concentration_improves');
        expect(concentrationCheck?.passed).toBe(true);
        expect(concentrationCheck?.message).toContain('improved from');
      });

      it('should warn about execution latency', () => {
        const slowFacts = {
          ...validFacts,
          execution_latency_ms: 6000 // > 5 seconds
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(slowFacts, validPlan);

        const latencyCheck = verification.checks.find(c => c.name === 'execution_latency');
        expect(latencyCheck?.passed).toBe(false);
        expect(latencyCheck?.message).toContain('consider optimization');
      });
    });

    describe('Confidence scoring', () => {
      it('should calculate high confidence when all checks pass', () => {
        const verification = VerificationMiddleware.verifyFactsAndPlan(validFacts, validPlan);
        expect(verification.confidence_score).toBeGreaterThanOrEqual(0.9);
      });

      it('should reduce confidence for failed warnings', () => {
        const factsWithWarning = {
          ...validFacts,
          execution_latency_ms: 6000
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(factsWithWarning, validPlan);
        expect(verification.confidence_score).toBeLessThan(0.9);
        expect(verification.status).toBe('partial');
      });

      it(' should give low confidence for failed critical checks', () => {
        const invalidFacts = {
          ...validFacts,
          top_allocation_percentage: 90.0,
          allocations: [
            { symbol: 'AAPL', allocationInPercentage: 90.0 },
            { symbol: 'GOOGL', allocationInPercentage: 15.0 }
          ]
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(invalidFacts, validPlan);
        expect(verification.confidence_score).toBeLessThan(0.5);
        expect(verification.status).toBe('failed');
      });
    });

    describe('Symbol resolution', () => {
      it('should warn about unresolved symbols in plan', () => {
        const factsWithMissingSymbol = {
          ...validFacts,
          allocations: [
            { symbol: 'AAPL', allocationInPercentage: 25.0 },
            { symbol: 'GOOGL', allocationInPercentage: 25.0 },
            { symbol: 'MSFT', allocationInPercentage: 25.0 },
            { symbol: 'TSLA', allocationInPercentage: 25.0 }
          ]
        };

        const planWithExtraSymbol = {
          ...validPlan,
          target_allocations: {
            'AAPL': 25.0,
            'GOOGL': 25.0,
            'MSFT': 25.0,
            'TSLA': 25.0,
            'SPY': 25.0 // Extra symbol not in facts
          }
        };

        const verification = VerificationMiddleware.verifyFactsAndPlan(
          factsWithMissingSymbol,
          planWithExtraSymbol
        );

        const symbolCheck = verification.checks.find(c => c.name === 'symbols_resolved');
        expect(symbolCheck?.passed).toBe(false);
        expect(symbolCheck?.message).toContain('Unresolved symbols in plan');
      });

      it('should pass when all plan symbols are resolved', () => {
        const verification = VerificationMiddleware.verifyFactsAndPlan(validFacts, validPlan);

        const symbolCheck = verification.checks.find(c => c.name === 'symbols_resolved');
        expect(symbolCheck?.passed).toBe(true);
      });
    });
  });
});
