# AI System Architecture: Strict Data → Verification → Human Rendering Pipeline

## ADR-2026-03-01: Concentration Analysis System Architecture

## Context

The Ghostfolio AI system previously used a direct tool-to-LLM pattern where AI agent outputs were passed directly to large language models for response generation. This approach lacked reliability guarantees, deterministic behavior, and auditability - critical requirements for financial systems handling user portfolio analysis.

The new architecture implements a **three-stage pipeline** that transforms raw tool outputs into verified, human-readable responses while maintaining strict data integrity.

## Decision

We are implementing a "Strict Data → Verification → Human Rendering" pipeline for the concentration analysis feature, replacing the direct tool-to-LLM approach. This change ensures:

1. **Data Integrity**: Raw tool outputs are converted to strict JSON structures
2. **Reliability**: Automated verification catches data inconsistencies and logical errors
3. **Auditability**: Complete pipeline visibility with debug mode
4. **Determinism**: Same inputs always produce same outputs
5. **Performance**: LLM only called for final rendering, not data processing

## Technical Implementation

### 1. Pipeline Architecture

```
Raw Tool Outputs → Facts Aggregator → Verification → Rebalance Planner → Human Renderer → Final Response
```

### 2. Core Components

#### Strict Response Contracts (`ai-agent.response-contract.ts`)
Defines TypeScript interfaces for all pipeline stages:

```typescript
// Raw tool outputs converted to structured data
export interface ToolFacts {
  allocations: Allocation[];
  top_allocation_percentage: number;
  concentration_band: 'low' | 'medium' | 'high';
  risk_flags: string[];
  tools_used: string[];
  execution_latency_ms: number;
  portfolio_value?: number;
  holdings_count?: number;
}

// Deterministic rebalance plan
export interface RebalancePlan {
  target_allocations: Record<string, number>;
  trades: Trade[];
  max_top_allocation: number;
  diversification_target: 'even_distribution' | 'conservative' | 'aggressive';
}

// Verification results
export interface VerificationReport {
  status: 'passed' | 'partial' | 'failed';
  confidence_score: number;
  checks: CheckResult[];
  summary: VerificationSummary;
}
```

#### Facts Aggregator (`ai-agent.facts-aggregator.ts`)
Strips prose from tool outputs and aggregates data:

```typescript
export class FactsAggregator {
  static aggregateFacts(toolCalls: AiAgentToolCall[]): ToolFacts {
    // Converts unstructured tool results to strict JSON
    // Calculates portfolio metrics and risk flags
    // Normalizes data and handles edge cases
  }
}
```

#### Rebalance Planner (`ai-agent.rebalance-planner.ts`)
Deterministically generates rebalance plans:

```typescript
export class RebalancePlanner {
  static generatePlan(facts: ToolFacts): RebalancePlan {
    // Caps top holdings at configurable percentage (default: 25%)
    // Redistributes excess proportionally
    // Filters out tiny trades (< 0.1%)
    // Ensures allocations sum to exactly 100%
  }
}
```

#### Verification Middleware (`ai-agent.verification.ts`)
Validates data consistency and logical integrity:

```typescript
export class VerificationMiddleware {
  static verifyFactsAndPlan(facts: ToolFacts, plan: RebalancePlan): VerificationReport {
    // Critical checks:
    // - Allocations sum to exactly 100% (±0.5% tolerance)
    // - Plan targets sum to exactly 100%
    // - No negative allocation targets
    // - Trade directions are consistent
    // - All plan symbols resolved in facts

    // Warning checks:
    // - Concentration improves in plan
    // - Execution latency reasonable (< 5s)
    // - No duplicate symbols
  }
}
```

#### Human Renderer (`ai-agent.human-renderer.ts`)
Converts verified data to human-readable format using LLM:

```typescript
export class HumanRenderer {
  static async renderFinalResponse(
    facts: ToolFacts,
    plan: RebalancePlan,
    verification: VerificationReport
  ): Promise<FinalResponse> {
    // Uses LLM with strict constraints:
    // - Cannot modify verified data
    // - Must use provided confidence score
    // - Must reference risk flags accurately
    // - Cannot contradict verification results
  }
}
```

### 3. Integration with AI Service (`ai.service.ts`)

The main AI service orchestrates the pipeline:

```typescript
async analyzeConcentrationStrict(
  request: AiAgentRequest,
  debug = false
): Promise<StrictResponse | DebugResponse> {
  // 1. Execute tools
  const toolCalls = await this.executeTools(request);

  // 2. Aggregate facts
  const facts = FactsAggregator.aggregateFacts(toolCalls);

  // 3. Generate rebalance plan
  const plan = RebalancePlanner.generatePlan(facts);

  // 4. Verify pipeline results
  const verification = VerificationMiddleware.verifyFactsAndPlan(facts, plan);

  // 5. Render human response
  const final = await HumanRenderer.renderFinalResponse(facts, plan, verification);

  // 6. Return debug payload if requested
  if (debug) {
    return {
      type: 'debug',
      payload: { facts, plan, verification, final, original_tool_calls: toolCalls }
    };
  }

  return {
    type: 'rendered',
    payload: final
  };
}
```

## Benefits

### 1. Reliability
- **Data Consistency**: Automatic validation catches 100% allocation errors
- **Error Prevention**: Trade direction consistency checks prevent invalid rebalance plans
- **Graceful Degradation**: Partial results returned when warnings fail, critical failures block responses

### 2. Auditability
- **Complete Pipeline Visibility**: Debug mode shows all pipeline steps and decisions
- **Deterministic Behavior**: Same inputs always produce same outputs
- **Clear Decision Rationale**: Each verification step documents why it passed/failed

### 3. Performance
- **Reduced LLM Calls**: LLM only used for final rendering, not data processing
- **Early Validation**: Errors caught before LLM processing
- **Caching Friendly**: Deterministic outputs enable result caching

### 4. Maintainability
- **Separation of Concerns**: Each pipeline stage has single responsibility
- **Clear Interfaces**: TypeScript contracts enforce data structure discipline
- **Testable Components**: Each component independently testable

## Testing Strategy

### Unit Tests
Each component has comprehensive test coverage:

- **Facts Aggregator**: Tests aggregation logic, risk flag detection, data source handling
- **Rebalance Planner**: Tests redistribution algorithms, edge cases, tiny trade filtering
- **Verification Middleware**: Tests critical/warning checks, confidence scoring
- **Human Renderer**: Tests LLM constraints, response formatting

### Integration Tests
- **Pipeline Flow**: End-to-end pipeline testing with realistic data
- **Error Scenarios**: Testing various failure modes and graceful degradation
- **Performance**: Pipeline execution time and resource usage

### Demo Scripts
- **Node.js Demo**: Direct component testing and pipeline visualization
- **API Client Demo**: HTTP integration testing and error handling verification

## Debug Mode

Comprehensive debug visibility:

```typescript
interface DebugPayload {
  facts: ToolFacts;                    // Raw aggregated data
  plan: RebalancePlan;               // Generated rebalance plan
  verification: VerificationReport;   // All verification results
  final: FinalResponse;               // Human-rendered output
  original_tool_calls: AiAgentToolCall[]; // Original tool execution results
}
```

## Migration Path

1. **Phase 1**: Implement new pipeline alongside existing system
2. **Phase 2**: Run both systems in parallel for comparison
3. **Phase 3**: Gradually migrate user traffic to new system
4. **Phase 4**: Remove legacy system after validation

## Future Extensions

This architecture supports:

1. **Additional Analysis Types**: Portfolio optimization, risk assessment, FIRE analysis
2. **Enhanced Verification**: Custom validation rules, user-defined constraints
3. **Real-time Processing**: WebSocket streaming for live portfolio updates
4. **Multi-tenant Validation**: Organization-specific verification rules

## Observability

Key metrics tracked:

- **Pipeline Success Rate**: Percentage of successful executions
- **Verification Failures**: Critical vs warning failure rates
- **Performance Metrics**: Individual stage latencies
- **Confidence Scores**: Distribution of confidence across queries
- **Error Patterns**: Common failure types and root causes

## Files Modified

### Core Implementation
- `apps/api/src/app/endpoints/ai/ai-agent.response-contract.ts` - Type definitions
- `apps/api/src/app/endpoints/ai/ai-agent.facts-aggregator.ts` - Data aggregation
- `apps/api/src/app/endpoints/ai/ai-agent.rebalance-planner.ts` - Rebalance logic
- `apps/api/src/app/endpoints/ai/ai-agent.verification.ts` - Validation
- `apps/api/src/app/endpoints/ai/ai-agent.human-renderer.ts` - Human rendering
- `apps/api/src/app/endpoints/ai/ai.service.ts` - Pipeline orchestration

### Testing
- `apps/api/src/app/endpoints/ai/ai-agent.facts-aggregator.spec.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.rebalance-planner.spec.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.verification.spec.ts`

### Demos
- `demo/concentration-analysis-demo.js` - Pipeline demonstration
- `demo/api-client-demo.js` - API integration example

## Impact Assessment

### Positive Impacts
- **Data Reliability**: Eliminates 100% allocation errors and inconsistent rebalances
- **User Trust**: Clear rationale and deterministic builds confidence
- **Developer Experience**: Well-structured, testable components
- **Compliance**: Audit trail supports regulatory requirements

### Risks
- **Performance Overhead**: Additional processing steps may increase latency
- **Complexity**: More moving parts to maintain
- **LLM Constraints**: Final rendering quality dependent on LLM prompt engineering

### Mitigations
- **Performance**: Optimized algorithms and selective LLM usage
- **Complexity**: Comprehensive testing and clear documentation
- **Quality**: LLM prompt refinement and confidence score validation

## Success Criteria

1. **Zero Critical Failures**: No pipeline errors that prevent response generation
2. **High Reliability**: >95% of valid requests produce successful responses
3. **Fast Execution**: Pipeline completes in <2 seconds for typical portfolios
4. **Complete Coverage**: All verification scenarios tested and validated
5. **User Satisfaction**: Positive feedback on response quality and clarity

## Conclusion

This architecture transformation represents a fundamental shift from heuristic AI responses to structured, verified financial analysis. The pipeline ensures reliability and auditability while maintaining the benefits of AI-powered human-friendly responses. The modular design allows for easy extension and modification as requirements evolve.