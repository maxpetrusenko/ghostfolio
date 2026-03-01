# User-Driven Demo Scenarios

## Current State: Tool-Driven Demo
- Shows internal tool execution flow
- Demonstrates tool mechanics and routing
- Focuses on system architecture over user value

## Target: User-Driven Demo
- Shows user problems → system response → verification outcome
- Highlights reasoning and multi-tool coordination
- Visible eval/verification signals

---

## Scenario 1: Portfolio Risk Assessment

### User-Focused Flow
**User Problem**: "Is my portfolio too risky given the current market conditions?"

**System Response Flow**:
1. **Intent Detection**: Identifies risk analysis query + portfolio context
2. **Data Collection**: Fetches current holdings + market data
3. **Analysis Coordination**:
   - Stress test tool: Shock scenarios (-10%, -20%, -30%)
   - Volatility analysis: Historical volatility calculation
   - Concentration risk: Sector exposure breakdown
4. **Verification**: Numerical consistency checks across all tools
5. **Presentation**: Risk score with breakdown + 3 scenarios with confidence indicators

**Visible Verification Signal**:
- Green checkmark on risk score (passed verification)
- Confidence badges on each scenario (e.g., "Data: 95% reliable")
- Red flag on any anomalies (e.g., "Unreliable market data for 3 symbols")

### Key Talking Points
> "When you ask about portfolio risk, the system doesn't just run one tool - it coordinates multiple analysis methods, cross-validates the results, and shows you exactly how confident you should be in each assessment."

---

## Scenario 2: Rebalancing Recommendation

**User Problem**: "Should I rebalance my portfolio?"

**System Response Flow**:
1. **Intent Detection**: Rebalancing query + current allocation
2. **Multi-Tool Coordination**:
   - Allocation analysis: Current vs target breakdown
   - Market data: Current prices for all holdings
   - Cost analysis: Transaction costs vs rebalancing benefit
3. **Verification**:
   - Allocation sum validation (±5% tolerance)
   - Market data coverage check
   - Cost-benefit validation
4. **Decision Logic**: Recommends rebalance only if net benefit > costs
5. **Presentation**: Clear recommendation with cost-benefit breakdown

**Visible Verification Signal**:
- Allocation pie chart with validation status
- Cost-benefit meter showing net impact
- Recommendation strength indicator (High/Medium/Low confidence)

---

## Scenario 3: Anomaly Detection

**User Problem**: "Something seems off with my portfolio - investigate"

**System Response Flow**:
1. **Intent Detection**: Anomaly investigation query
2. **Multi-Tool Coordination**:
   - Performance analysis: Recent returns vs historical
   - Holding analysis: Individual position changes
   - Market data: Cross-verify price movements
3. **Verification**: Cross-check all data sources for consistency
4. **Anomaly Detection**: Flag deviations > 2 standard deviations
5. **Presentation**: Anomalies ranked by severity with root cause analysis

**Visible Verification Signal**:
- Anomaly severity scale (1-5) with confidence indicators
- Root cause breakdown with data reliability scores
- "Investigated by 3 independent methods" badge

---

## Scenario 4: Goal Progress Tracking

**User Problem**: "Am I on track to retire in 10 years?"

**System Response Flow**:
1. **Intent Detection**: Goal tracking + timeline query
2. **Multi-Tool Coordination**:
   - Projection tool: Monte Carlo simulation
   - Savings rate analysis: Current vs required
   - Market simulation: Historical scenario testing
3. **Verification**: Cross-validate projection assumptions
4. **Presentation**: Probability of success with contributing factors

**Visible Verification Signal**:
- Success probability gauge with confidence intervals
- Key driver analysis with reliability scores
- "Based on 1,000 simulations" transparency badge

---

## Demo Structure Template

### Opening Hook
User problem statement → System approach overview

### Live Demo
1. User types query
2. System processes with visible indicators
3. Results with verification badges
4. Interactive follow-up options

### Key Elements to Show
- **Intent Detection Visual**: How query is classified
- **Tool Coordination**: Which tools work together
- **Verification Results**: What passed/failed validation
- **Confidence Indicators**: How reliable each result is
- **Next Steps**: What the user can do next

### Technical Story
Instead of: "We use regex patterns and tool routing"
Frame: "The system understands your financial intent, coordinates multiple analysis methods, validates the results for consistency, and shows you exactly how confident you should be"

### Control Narrative
"We don't just give you answers - we verify them through multiple independent methods and show you the confidence level so you can make informed decisions"