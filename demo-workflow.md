# One Tight Demo Workflow

## The Perfect 2-Minute Demo

### User Problem (Clear & Relatable)
**"Should I sell my Tesla stock? It's dropped 15% this week and I'm worried it'll keep falling."**

### Multi-Tool Coordination (Show Reasoning)
```
User Query → Intent Detection → 3 Tools Execute → Verification → Response
```

#### Step 1: Intent Detection
- Pattern: "sell [symbol]" + concern about price drop
- Confidence: 95%
- Tools Triggered: Portfolio Analysis, Market Sentiment, Risk Assessment

#### Step 2: Multi-Tool Execution
```typescript
// Tool Results (Strict Facts)
{
  portfolio: {
    position: 250 shares,
    avg_cost: $185.20,
    current_price: $157.30,
    loss: $6,975 (15%)
  },
  market: {
    sentiment: "bearish",
    volatility: "high",
    analyst_rating: "hold"
  },
  risk: {
    portfolio_impact: "medium",
    replacement_opportunity: "high-quality growth"
  }
}
```

#### Step 3: Verification Layer
```
Verification Status: ⚠ WARNING
Confidence: 88%
Issues: ["High volatility in TSLA", "Position represents 8% of portfolio"]
Passed: [Portfolio data consistent, Market data validated]
```

### User Message (Hybrid Response)
```
🟡 Tesla Position Analysis - 88% Confidence

Portfolio Impact:
• Current Value: $39,325 (↓$6,975 from avg cost)
• Position Size: 8% of portfolio (significant)
• Time Horizon: 1 week loss

Market Context:
• Sentiment: Bearish ⬇
• Volatility: High ⚡
• Analyst Rating: Hold ➖

🚨 Warning Signs:
• High volatility indicates continued risk
• Large position creates portfolio concentration
• Short-term timing is uncertain

✅ Opportunities:
• Loss harvesting available if tax beneficial
• Consider rebalancing if over-allocated
• Monitor for technical reversal signals

💡 My Recommendation:
Given your 8% allocation and high volatility, consider:
1. Selling 50% to realize tax loss and reduce risk
2. Hold remaining shares for potential recovery
3. Use proceeds to diversify into stable growth

Next Steps:
• See tax implications of selling
• Compare rebalancing alternatives
• Set alert at $150 support level
```

### Verification Signal (Visible)
```
[✓ Portfolio Data Verified] [✓ Market Data Confirmed] [⚠ High Volatility Detected]
Overall Confidence: 88%
```

## Demo Script

### Opening (15 seconds)
"Let me show you how the system helps with tough portfolio decisions. Say you're worried about Tesla dropping 15%..."

### Live Demo (60 seconds)
1. Type query: "Should I sell my Tesla stock? It's dropped 15% this week"
2. Show intent detection: "Identified as sell analysis query with market concern"
3. Show tool coordination: "Portfolio tool fetches your position, market tool checks sentiment, risk tool assesses impact"
4. Show verification: "88% confidence with volatility warning flagged"
5. Present hybrid response: "Clear facts + analysis + next steps"

### Closing (45 seconds)
"The key is we don't just give opinions - we coordinate multiple tools, verify the data consistency, and show you exactly how confident to be. You get actionable steps, not just generic advice."

## Why This Works

1. **Real Problem**: Everyone worries about losing money on stocks
2. **Multi-Tool**: Shows coordination, not single tools
3. **Verified Outcome**: Clear confidence with reasoning
4. **User-Friendly**: Strict facts + helpful explanation
5. **Actionable**: Specific next steps, not vague suggestions

## Practice Focus

- **No Tool Noise**: Don't explain internal mechanics
- **User First**: Focus on their problem and solution
- **Confident Tone**: "The system shows..." not "It might..."
- **Visible Verification**: Show the confidence breakdown clearly