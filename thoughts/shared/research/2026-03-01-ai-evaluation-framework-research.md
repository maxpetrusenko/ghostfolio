# AI Evaluation Framework Research for Ghostfolio

**Date**: 2026-03-01
**Ticket**: ENG-001 (to be created)
**Research Focus**: Comprehensive AI evaluation framework development

## Problem Statement

Ghostfolio currently lacks a systematic approach to evaluating AI-powered features. The existing AI agent implementation needs robust testing to ensure:

- Reliable tool execution
- Accurate responses
- Performance consistency
- Safety and compliance

## Current State Analysis

### Existing AI Infrastructure

- **AI Agent**: `apps/api/src/app/endpoints/ai/ai.service.ts`
- **Evaluation Interfaces**: `apps/api/src/app/endpoints/ai/evals/mvp-eval.interfaces.ts`
- **Happy Path Dataset**: `apps/api/src/app/endpoints/ai/evals/dataset/broker-statement.dataset.ts`
- **Broker Statement Pipeline**: `apps/api/src/app/broker-statement/`

### Current Evaluation Capabilities

The system has basic evaluation structures but lacks comprehensive testing:

1. **MVP Evaluation Interface** (`mvp-eval.interfaces.ts`):
   - Defines `AiAgentMvpEvalCase` structure
   - Supports verification checks
   - Tool execution tracking

2. **Happy Path Dataset** (`broker-statement.dataset.ts`):
   - 26 test cases covering major features
   - Focuses on portfolio analysis, risk assessment, market data
   - Mixed tool specifications and verification checks

## Gap Analysis

### Missing Components

1. **Comprehensive Test Coverage**
   - No edge case testing
   - No error scenario testing
   - Limited regression testing

2. **Performance Monitoring**
   - No response time tracking
   - No token usage monitoring
   - No success rate metrics

3. **Multi-Model Support**
   - Current evaluation focuses on single model
   - Need for OpenAI, Anthropic, Google model support

4. **Automated Testing Pipeline**
   - No CI/CD integration
   - No automated regression testing
   - No continuous monitoring

## Technical Architecture Requirements

### Core Components

1. **Test Dataset Management**

   ```typescript
   interface TestCase {
     id: string;
     category: 'happy_path' | 'edge_case' | 'error_scenario' | 'regression';
     input: { query: string };
     expected: {
       requiredTools: string[];
       forbiddenTools?: string[];
       minCitations?: number;
       answerIncludes?: string[];
       verificationChecks: VerificationCheck[];
     };
     setup?: TestCaseSetup;
   }
   ```

2. **Tool Execution Verification**
   - Tool call validation
   - Error handling verification
   - Timeout handling
   - Retry logic testing

3. **Response Quality Metrics**
   - Accuracy scoring
   - Completeness metrics
   - Citation verification
   - Constraint adherence

4. **Performance Benchmarking**
   - Response time percentiles
   - Token usage tracking
   - Success rate monitoring
   - Resource utilization

### Integration Points

1. **AI Service Integration**
   - `ai.service.ts` - evaluation execution
   - Agent response validation
   - Tool execution tracking

2. **Broker Statement Pipeline**
   - Test data generation
   - Statement processing tests
   - Error handling validation

3. **Database Schema**
   - Evaluation results storage
   - Performance metrics tracking
   - Test case management

## Implementation Strategy

### Phase 1: Foundation (Week 1-2)

1. **Expand Test Dataset**
   - Add edge cases (50+ test cases)
   - Create error scenarios (30+ test cases)
   - Develop regression tests (20+ test cases)

2. **Build Evaluation Engine**
   - Tool execution verification
   - Response quality scoring
   - Performance tracking

### Phase 2: Multi-Model Support (Week 3)

1. **Model-Specific Testing**
   - OpenAI GPT testing
   - Anthropic Claude testing
   - Google Gemini testing

2. **Cross-Model Validation**
   - Consistency testing
   - Performance comparison
   - Feature parity checks

### Phase 3: Automation & Monitoring (Week 4)

1. **CI/CD Integration**
   - Automated test execution
   - Performance regression detection
   - Quality gate implementation

2. **Monitoring Dashboard**
   - Real-time metrics
   - Alerting system
   - Trend analysis

## Success Metrics

### Quality Metrics

- 95%+ tool execution accuracy
- 90%+ response accuracy
- <100ms average response time
- 0 critical bugs in production

### Coverage Metrics

- 100% AI feature coverage
- 95%+ edge case coverage
- 100% regression test coverage
- All models tested

### Performance Metrics

- 50% reduction in debugging time
- 40% improvement in feature development speed
- 95%+ test automation rate
- Sub-100ms p95 response time

## Risk Assessment

### Technical Risks

1. **Tool Complexity**: Multi-tool coordination increases testing complexity
2. **Model Variability**: Different AI models behave differently
3. **Performance Scaling**: Large test datasets may impact performance

### Mitigation Strategies

1. **Modular Design**: Independent test components for easier maintenance
2. **Model Abstraction**: Common interface for different AI models
3. **Test Optimization**: Parallel execution, caching, smart sampling

## Recommended Next Steps

### Immediate Actions (This Week)

1. **Expand Happy Path Dataset**
   - Add missing verification checks
   - Include expected responses
   - Create edge cases

2. **Build Evaluation Runner**
   - Test execution engine
   - Results collection
   - Basic reporting

3. **Setup CI/CD Pipeline**
   - GitHub Actions integration
   - Automated test execution
   - Performance monitoring

### Medium Term (Next 2-3 Weeks)

1. **Multi-Model Support**
   - Add Anthropic Claude integration
   - Add Google Gemini integration
   - Cross-model testing

2. **Advanced Metrics**
   - Response quality scoring
   - Performance benchmarking
   - User satisfaction metrics

### Long Term (Next Month)

1. **ML-Based Evaluation**
   - Automated test case generation
   - Anomaly detection
   - Predictive quality metrics

## Conclusion

The AI evaluation framework is critical for ensuring Ghostfolio's AI features are reliable, accurate, and performant. The proposed architecture provides a comprehensive approach to testing that covers all aspects of AI functionality while scaling with the platform's growth.

Key success factors:

- Start with comprehensive happy path testing
- Gradually expand to edge cases and error scenarios
- Implement continuous monitoring and alerting
- Maintain flexibility for future AI model integrations
