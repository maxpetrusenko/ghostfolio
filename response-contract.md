# Hybrid Response Contract

## Pattern: Strict Facts + Friendly Explanation

### Current Problem
- Tool output too technical/noisy
- LLM responses too verbose/unreliable
- Demo flow unclear

### Solution Contract
```
Tool Result → Verification → User Message
```

### Step 1: Tool Result (Strict & Minimal)
```typescript
interface StrictToolResult {
  facts: {
    price: number;
    change: number;
    allocation: { [sector: string]: number };
    risk_score: number;
    confidence: number;
    anomalies: string[];
  };
  metadata: {
    timestamp: string;
    sources: string[];
    verified: boolean;
  };
}
```

### Step 2: Verification Layer
```typescript
interface Verification {
  status: 'passed' | 'warning' | 'failed';
  confidence: number;
  issues: string[];
  badge: '✓' | '⚠' | '✗';
}
```

### Step 3: User Message (Hybrid)
```typescript
interface UserMessage {
  critical_facts: string[];          // Strict from tool
  explanation: string;               // LLM adds context
  verification: Verification;         // Clear status
  next_steps: string[];              // Actionable advice
}
```

## Example: Portfolio Risk Query

### User Input
"Is my portfolio too risky right now?"

### Tool Result (Strict)
```json
{
  "facts": {
    "price": 125430.75,
    "change": -2.3,
    "allocation": {
      "tech": 38.2,
      "finance": 22.1,
      "healthcare": 18.7,
      "energy": 12.4,
      "cash": 8.6
    },
    "risk_score": 7.2,
    "confidence": 0.87
  },
  "metadata": {
    "timestamp": "2024-03-01T10:30:00Z",
    "sources": ["market-api", "portfolio-db"],
    "verified": true
  }
}
```

### Verification
```json
{
  "status": "warning",
  "confidence": 0.87,
  "issues": ["High tech concentration (38.2%)"],
  "badge": "⚠"
}
```

### User Message (Final Output)
```
🟡 Medium Risk Portfolio Alert

Portfolio Value: $125,430.75 (↓2.3% today)

Key Facts:
• Tech concentration at 38.2% (above 30% threshold)
• Current risk score: 7.2/10
• Verified with 87% confidence

⚠ Concern: High tech concentration increases volatility
✓ Diversified across 5 sectors
✓ Cash position provides buffer

Recommendation:
• Consider reducing tech allocation to 25-30%
• Add defensive sectors (consumer staples, utilities)
• Monitor tech sector closely this week

Next Steps:
1. View detailed sector breakdown
2. See rebalancing recommendations
3. Set risk alerts for concentration
```

## Demo Flow

1. **User Problem** → "Is my portfolio too risky?"
2. **Multi-Tool Execution** → Portfolio fetch + Risk analysis + Allocation check
3. **Strict Facts** → Raw numbers, allocations, scores
4. **Verification** → Confidence score + issue flags
5. **Hybrid Response** → Critical facts + LLM explanation + Verification badge

## Benefits
- **Clean Demo**: Clear user story end-to-end
- **Reliable**: Facts stay strict, explanation adds value
- **Verifiable**: Users can see what's data vs. interpretation
- **Controllable**: You can guarantee the facts are correct