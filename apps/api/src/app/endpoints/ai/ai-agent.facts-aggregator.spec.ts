import { FactsAggregator, FactsAggregatorToolCall } from './ai-agent.facts-aggregator';

describe('FactsAggregator', () => {
  const mockPortfolioAnalysisResult = {
    holdings: [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        allocationInPercentage: 35.5,
        valueInBaseCurrency: 35500
      },
      {
        symbol: 'GOOGL',
        name: 'Alphabet Inc.',
        allocationInPercentage: 25.3,
        valueInBaseCurrency: 25300
      },
      {
        symbol: 'MSFT',
        name: 'Microsoft Corp.',
        allocationInPercentage: 20.1,
        valueInBaseCurrency: 20100
      },
      {
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        allocationInPercentage: 19.1,
        valueInBaseCurrency: 19100
      }
    ]
  };

  const mockRiskAssessmentResult = {
    concentrationBand: 'high',
    hhi: 3250,
    topHoldingAllocation: 35.5,
    diversificationScore: 0.65
  };

  const mockPortfolioSummary = {
    totalValueInBaseCurrency: 100000,
    holdingsCount: 4
  };

  const mockToolCalls: FactsAggregatorToolCall[] = [
    {
      toolName: 'portfolio_analysis',
      result: mockPortfolioAnalysisResult,
      executionLatency: 1200,
      citations: [{
        tool: 'portfolio_analysis',
        confidence: 0.9,
        sources: []
      }]
    },
    {
      toolName: 'risk_assessment',
      result: mockRiskAssessmentResult,
      executionLatency: 800,
      citations: [{
        tool: 'risk_assessment',
        confidence: 0.85,
        sources: []
      }]
    },
    {
      toolName: 'get_portfolio_summary',
      result: mockPortfolioSummary,
      executionLatency: 500,
      citations: []
    }
  ];

  describe('aggregateFacts', () => {
    it('should aggregate facts correctly with high concentration', () => {
      const facts = FactsAggregator.aggregateFacts(mockToolCalls);

      expect(facts.allocations).toHaveLength(4);
      expect(facts.allocations[0]).toEqual({
        symbol: 'AAPL',
        name: 'Apple Inc.',
        allocationInPercentage: 35.5,
        valueInBaseCurrency: 35500
      });
      expect(facts.top_allocation_percentage).toBe(35.5);
      expect(facts.concentration_band).toBe('medium');
      expect(facts.risk_flags).toContain('high_concentration');
      expect(facts.risk_flags).toContain('single_holding_over_30');
      expect(facts.tools_used).toEqual(['portfolio_analysis', 'risk_assessment', 'get_portfolio_summary']);
      expect(facts.execution_latency_ms).toBe(2500);
    });

    it('should handle moderate concentration', () => {
      const moderatePortfolioCalls = [
        ...mockToolCalls.slice(0, 1), // Keep portfolio analysis
        {
          ...mockToolCalls[1],
          result: {
            ...mockRiskAssessmentResult,
            concentrationBand: 'medium',
            topHoldingAllocation: 28.0
          }
        }
      ];

      const facts = FactsAggregator.aggregateFacts(moderatePortfolioCalls);

      expect(facts.concentration_band).toBe('medium');
      expect(facts.risk_flags).toContain('moderate_concentration');
    });

    it('should handle low concentration', () => {
      const lowConcentrationCalls = [
        {
          ...mockToolCalls[0],
          result: {
            ...mockPortfolioAnalysisResult,
            holdings: [
              {
                symbol: 'AAPL',
                name: 'Apple Inc.',
                allocationInPercentage: 20.0,
                valueInBaseCurrency: 20000
              },
              {
                symbol: 'GOOGL',
                name: 'Alphabet Inc.',
                allocationInPercentage: 20.0,
                valueInBaseCurrency: 20000
              },
              {
                symbol: 'MSFT',
                name: 'Microsoft Corp.',
                allocationInPercentage: 20.0,
                valueInBaseCurrency: 20000
              },
              {
                symbol: 'TSLA',
                name: 'Tesla Inc.',
                allocationInPercentage: 20.0,
                valueInBaseCurrency: 20000
              },
              {
                symbol: 'AMZN',
                name: 'Amazon.com Inc.',
                allocationInPercentage: 20.0,
                valueInBaseCurrency: 20000
              }
            ]
          }
        },
        {
          ...mockToolCalls[1],
          result: {
            ...mockRiskAssessmentResult,
            concentrationBand: 'low',
            topHoldingAllocation: 20.0
          }
        }
      ];

      const facts = FactsAggregator.aggregateFacts(lowConcentrationCalls);

      expect(facts.concentration_band).toBe('low');
      expect(facts.risk_flags).not.toContain('high_concentration');
      expect(facts.risk_flags).not.toContain('moderate_concentration');
    });

    it('should handle FIRE infeasible flag', () => {
      const fireInfeasibleCalls: FactsAggregatorToolCall[] = [
        ...mockToolCalls,
        {
          toolName: 'fire_analysis',
          result: {
            status: 'infeasible',
            yearsToFinancialIndependence: null,
            monthlyExpenses: 5000,
            safeWithdrawalRate: 0.04,
            portfolioValue: 100000
          },
          executionLatency: 300,
          citations: []
        }
      ];

      const facts = FactsAggregator.aggregateFacts(fireInfeasibleCalls);

      expect(facts.risk_flags).toContain('fire_infeasible');
    });

    it('should handle missing portfolio summary gracefully', () => {
      const callsWithoutSummary = mockToolCalls.filter(call =>
        call.toolName !== 'get_portfolio_summary'
      );

      const facts = FactsAggregator.aggregateFacts(callsWithoutSummary);

      expect(facts.portfolio_value).toBeUndefined();
      expect(facts.holdings_count).toBeUndefined();
    });

    it('should set data sources correctly', () => {
      const callsWithDataSources: FactsAggregatorToolCall[] = [
        ...mockToolCalls,
        {
          toolName: 'get_live_quote',
          result: { symbol: 'AAPL', price: 150.25 },
          executionLatency: 200,
          citations: []
        },
        {
          toolName: 'symbol_lookup',
          result: { symbol: 'AAPL', name: 'Apple Inc.' },
          executionLatency: 150,
          citations: []
        }
      ];

      const facts = FactsAggregator.aggregateFacts(callsWithDataSources);

      expect(facts.data_sources).toEqual(['get_live_quote', 'symbol_lookup']);
    });

    it('should handle floating point precision correctly', () => {
      const impreciseCalls: FactsAggregatorToolCall[] = [
        {
          toolName: 'portfolio_analysis',
          result: {
            holdings: [
              {
                symbol: 'AAPL',
                allocationInPercentage: 33.333333333,
                valueInBaseCurrency: 33333.33
              },
              {
                symbol: 'GOOGL',
                allocationInPercentage: 33.333333333,
                valueInBaseCurrency: 33333.33
              },
              {
                symbol: 'MSFT',
                allocationInPercentage: 33.333333333,
                valueInBaseCurrency: 33333.34
              }
            ]
          },
          executionLatency: 1000,
          citations: []
        },
        {
          toolName: 'risk_assessment',
          result: {
            concentrationBand: 'medium',
            hhi: 3333,
            topHoldingAllocation: 33.333333333,
            diversificationScore: 0.8
          },
          executionLatency: 800,
          citations: []
        }
      ];

      const facts = FactsAggregator.aggregateFacts(impreciseCalls);

      expect(facts.concentration_band).toBe('medium');
      expect(facts.allocations).toHaveLength(3);
      expect(facts.allocations[0].allocationInPercentage).toBe(33.333333333);
    });
  });
});
