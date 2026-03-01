# Technical Tradeoff Communication Framework

## Philosophy
Frame decisions as pragmatic choices with clear rationale, not compromises. Show command of system design.

## Core Template

### 1. **Choice Framing**
- **What**: Clear statement of decision made
- **Why**: Primary constraint driving choice
- **Tradeoff**: What was sacrificed/gained
- **Future Path**: If/when this would be replaced

### 2. **Regex Case Study Example**

**Choice**: "We use regex for intent detection"
**Wrong framing**: "Regex was the only option we knew"

**Strong framing**:
> "We chose regex for intent detection because it provides 100% deterministic control over financial query parsing - critical for portfolio analysis where misclassification could trigger wrong tools. The tradeoff is maintainability (29 pattern rules) vs. precision. We'd replace this with a trained classifier when we have 10K+ labeled examples, but for now regex gives us auditability and zero hallucination risk."

### 3. **Key Tradeoffs to Frame**

#### Speed vs. Sophistication
- **Frame**: "Fast-path routing for direct actions enables sub-500ms responses for 70% of queries"
- **Tradeoff**: Complex multi-step analysis takes 2-3x longer but provides deeper insights

#### Determinism vs. Flexibility
- **Frame**: "Verification layers ensure numerical consistency within ±5% tolerance"
- **Tradeoff**: Rigorous checks prevent dangerous financial errors but require more computation

#### Cost vs. Quality
- **Frame**: "Token estimation with configurable caps controls cloud costs while maintaining response quality"
- **Tradeoff**: Hard limits prevent runaway costs but may truncate very long analyses

#### Coverage vs. Performance
- **Frame**: "Symbol resolution covers 95% of US stocks with fallback to company name matching"
- **Tradeoff**: Limited international coverage ensures faster response times

### 4. **Confidence Language Patterns**

**Weak**: "We're not sure", "Probably works", "Might need"
**Strong**: "Data shows 92% success rate on test queries", "Benchmarking indicates 40ms improvement", "Analysis reveals 87% coverage target"

### 5. **Demo Story Structure**

**Current (Tool-Driven)**: "First we call this tool, then this tool, then we score it"
**User-Driven**: "When you ask about portfolio risk, the system: detects intent → fetches market data → runs stress tests → presents 3 scenarios with confidence scores"

**Key**: Show the user's problem → System's response → Verification outcome → Next steps

### 6. **System Control Narrative**

Instead of: "Tools execute and sometimes fail"
Frame: "Control systems prevent tool execution on invalid inputs, verification gates catch anomalies before response, feedback loops continuously improve accuracy"

## Implementation Checklist

- [ ] Frame every major technical choice with constraint + rationale
- [ ] Replace uncertain language with data-backed confidence
- [ ] Structure demos around user scenarios, not tool mechanics
- [ ] Show verification outcomes as visible signals
- [ ] Emphasize control mechanisms (guardrails, validation, gates)