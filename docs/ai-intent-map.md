# AI Intent + Gating Map

Visual flowchart:
- `docs/ai-intent-flowchart.svg`

Code of truth:
- `apps/api/src/app/endpoints/ai/ai-agent.utils.ts` (`determineToolPlan`)
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.ts` (`applyToolExecutionPolicy`)
- `apps/api/src/app/endpoints/ai/ai.service.ts` (tool execution + service calls)

## 1) Routing Pipeline

1. Normalize query.
2. Build planner tools via `determineToolPlan()`.
3. If no planned tools and query is short follow-up, reuse prior successful tools.
4. Freshness breaker for follow-up reuse:
- If follow-up includes `now|today|latest|current|updated|update`, reuse only freshness tools:
- `market_data_lookup`, `get_live_quote`, `get_financial_news`, `price_history`
5. Apply policy via `applyToolExecutionPolicy()`:
- `direct`
- `clarify`
- `tools`
6. Execute tools selected by policy.

## 2) Market Intent Precedence (with symbol context)

When market-style intents overlap, planner clamps to highest match in this order:

1. `symbol_lookup`
2. `price_history`
3. `get_asset_fundamentals`
4. `get_financial_news`
5. `get_live_quote`
6. `market_data_lookup`

Notes:
- Generic market lookup trigger is now `quote|price|ticker|explicit symbol`.
- Bare `market` is not a trigger anymore.
- Ticker decision/research (`should I invest <symbol>`, `research <symbol>`) defaults to:
- `get_asset_fundamentals`, `get_financial_news`, `price_history`
- Adds `market_data_lookup` only for deep decision prompts that include both:
- valuation/metrics intent
- and catalyst/news intent

## 3) Intent Groups -> Tools

| Intent Group | Typical Trigger | Tools |
|---|---|---|
| Portfolio baseline | `portfolio`, `holding`, `allocation`, `performance`, `return` | `portfolio_analysis` |
| Portfolio value | `how much money`, `net worth`, `portfolio value` | `portfolio_analysis` |
| Summary/positions | `portfolio summary`, `what do i own` | `get_portfolio_summary`, `get_current_holdings` |
| Risk | `risk`, `concentration`, `diversif` | `portfolio_analysis`, `risk_assessment` |
| Risk metrics | `risk metrics`, `sector/country concentration` | `get_portfolio_risk_metrics` |
| Rebalance intent | `rebalanc`, `trim`, `underweight`, `overweight` | `portfolio_analysis`, `risk_assessment`, `rebalance_plan` |
| Stress/FIRE | `stress|crash|drawdown`, `fire|retire|withdrawal` | `stress_test` (+ portfolio/risk/FIRE bundle) |
| Transactions | `recent transactions`, `order history` | `get_recent_transactions` |
| Transaction categories | `categorize transactions` | `transaction_categorize` |
| Tax | `tax estimate`, `taxes this year`, `irs` | `tax_estimate` |
| Compliance | `compliance`, `violations`, `restricted` | `compliance_check` |
| Accounts | `account overview`, `cash balance` | `account_overview` |
| FX | `exchange rate`, `convert usd to eur` | `exchange_rate` |
| Benchmarks | `benchmark`, `index benchmark` | `market_benchmarks` |
| Activity history | `activity history`, `trading activity` | `activity_history` |
| Demo | `demo data`, `sample data` | `demo_data` |
| Action | `create account`, `place order` | `create_account`, `create_order` |

## 4) Policy Gating

### 4.1 Route `direct`
- Greeting/capability/arithmetic prompts.
- Unauthorized cross-user portfolio/account queries.

### 4.2 Route `clarify`
- Finance-like query with no planned tools.
- Action tool blocked by policy.
- Missing parameters for action execution.

### 4.3 Route `tools`
- At least one policy-allowed tool remains.

### 4.4 Action confirmation keywords

`buy`, `create`, `invest`, `make`, `open`, `order`, `place`, `rebalanc`, `sell`, `trim`

`allocat` was removed to reduce confirmation friction on read-only allocation questions.

### 4.5 Rebalance detail gate

Even with action wording, `rebalance_plan` is blocked unless query includes:
- target details (`target allocation`, `%`, `max position`, `80/20`)
- funding method (`new cash`, `sell`, `trim`)
- tax context (`taxable`, `retirement`, etc.)

Block reason: `needs_rebalance_details`

### 4.6 Order detail gate

`create_order` is blocked for vague prompts without amount/quantity.

Block reason: `needs_order_details`

### 4.7 Read-only tool set

Allowed without action confirmation:
- `account_overview`
- `activity_history`
- `demo_data`
- `exchange_rate`
- `get_asset_fundamentals`
- `get_current_holdings`
- `get_financial_news`
- `get_live_quote`
- `get_portfolio_risk_metrics`
- `get_portfolio_summary`
- `get_recent_transactions`
- `market_benchmarks`
- `price_history`
- `symbol_lookup`
- `calculate_rebalance_plan`
- `simulate_trade_impact`
- `transaction_categorize`
- `tax_estimate`
- `compliance_check`
- `portfolio_analysis`
- `risk_assessment`
- `market_data_lookup`
- `stress_test`

## 5) Tool -> Runtime Call Map

| Tool | Primary runtime call(s) |
|---|---|
| `portfolio_analysis` | `portfolioService.getDetails()` (via `runPortfolioAnalysis`) |
| `risk_assessment` | in-process risk calc (`runRiskAssessment`) |
| `rebalance_plan` / `calculate_rebalance_plan` | in-process rebalance calc (`runRebalancePlan`) |
| `stress_test` | in-process stress calc (`runStressTest`) |
| `market_data_lookup` / `get_live_quote` | `dataProviderService.getQuotes()` (via `runMarketDataLookup`) |
| `price_history` | `dataProviderService.getHistorical()` |
| `get_asset_fundamentals` | `dataProviderService.getAssetProfiles()` |
| `get_financial_news` | `aiAgentWebSearchService.searchStockNews()` (via `searchWebNewsForSymbols`) |
| `get_recent_transactions` / `activity_history` / `transaction_categorize` / `compliance_check` | `orderService.getOrders()` |
| `tax_estimate` | in-process tax parsing + estimate logic |
| `account_overview` | `accountService.getAccounts()` |
| `exchange_rate` | `exchangeRateDataService.toCurrency()` |
| `market_benchmarks` | `benchmarkService.getBenchmarks()` |
| `demo_data` | in-process static summary |
| `create_account` | `accountService.createAccount()` |
| `create_order` | `accountService.getAccounts()` + `orderService.createOrder()` |
| `symbol_lookup` | in-process symbol extraction currently (`extractSymbolsFromQuery`) |

## 6) If you edit behavior

1. Update this file.
2. Update planner/policy code.
3. Update tests:
- `apps/api/src/app/endpoints/ai/ai-agent.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai-agent.policy.utils.spec.ts`
- `apps/api/src/app/endpoints/ai/ai.service.spec.ts`
