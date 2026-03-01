# $500 AgentForge Bounty — Broker Statement Ingestion & Reconciliation Agent

## Customer Niche

**Target:** Ghostfolio power users and light RIAs/accountants who track multiple broker accounts and need accurate holdings reconciliation.

**Pain Point:** Broker CSV/OFX statements are messy, inconsistent across brokers (Schwab, Fidelity, IBKR), and reconciling them to Ghostfolio portfolio truth is manual and error-prone.

## Feature Summary

Broker Statement Ingestion + Reconciliation Agent: Upload broker statements → parse with broker-specific handlers → reconcile against Ghostfolio → explain differences → apply fixes.

## Data Source

**Primary:** Broker CSV/OFX exports (what users already have and trust)

**Required Fields:**

- account_id / broker_name
- symbol / ISIN
- transaction_type (BUY/SELL/DIVIDEND/FEE/TRANSFER)
- quantity, price, currency
- trade_date / settle_date
- fees, description

**Why this is "source of truth":**

- What users actually have from brokers
- What accountants reconcile against for tax reporting

## Technical Implementation

### 1. Database Schema (Prisma)

New tables to add to `prisma/schema.prisma`:

```prisma
// NEW MODELS FOR BROKER STATEMENT INGESTION

model BrokerStatementImport {
  id                String   @id @default(uuid())
  fileName          String
  fileHash          String   @unique  // For idempotency
  brokerName        String
  status            ImportStatus
  uploadedAt        DateTime @default(now())
  processedAt       DateTime?
  rowCount          Int      @default(0)
  errorCount        Int      @default(0)
  meta              Json?    @default("{}")
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rows              BrokerStatementRow[]
  reconciliationRuns ReconciliationRun[]

  @@index([userId])
  @@index([fileHash])
}

model BrokerStatementRow {
  id              String             @id @default(uuid())
  importId        String
  import          BrokerStatementImport @relation(fields: [importId], references: [id], onDelete: Cascade)
  rawData         Json               // Original row from file
  parsedData      Json?              // Normalized fields
  validationStatus RowValidationStatus
  errorCodes      String[]           @default([])
  createdAt       DateTime           @default(now())

  @@index([importId])
  @@index([validationStatus])
}

model SymbolMapping {
  id              String   @id @default(uuid())
  rawSymbol       String
  brokerName      String
  canonicalSymbol String   // Ghostfolio SymbolProfile symbol
  dataSource      DataSource @default(MANUAL)
  confidence      Float    @default(1.0)
  source          MappingSource @default(AUTO)
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([rawSymbol, brokerName, userId])
  @@index([userId])
}

model ReconciliationRun {
  id              String                 @id @default(uuid())
  importId        String
  import          BrokerStatementImport  @relation(fields: [importId], references: [id], onDelete: Cascade)
  accountId       String?
  status          ReconciliationStatus
  runAt           DateTime               @default(now())
  completedAt     DateTime?
  summary         Json?                  @default("{}")
  diffs           ReconciliationDiff[]
  userId          String

  @@index([importId])
  @@index([userId])
}

model ReconciliationDiff {
  id              String             @id @default(uuid())
  runId           String
  run             ReconciliationRun  @relation(fields: [runId], references: [id], onDelete: Cascade)
  diffType        DiffType
  severity        DiffSeverity
  statementRowId  String?
  ghostfolioOrderId String?
  details         Json               @default("{}")
  resolved        Boolean            @default(false)
  resolvedAt      DateTime?

  @@index([runId])
  @@index([resolved])
}

// ENUMS

enum ImportStatus {
  UPLOADED
  PARSING
  PARSED_OK
  PARSED_WITH_ERRORS
  FAILED
}

enum RowValidationStatus {
  OK
  WARNING
  ERROR
}

enum MappingSource {
  AUTO
  USER_OVERRIDE
  BROKER_PROVIDED
}

enum ReconciliationStatus {
  RUNNING
  COMPLETED
  FAILED
}

enum DiffType {
  MISSING_TXN
  QUANTITY_MISMATCH
  MISSING_DIVIDEND
  UNKNOWN_SYMBOL
  CASH_MISMATCH
  PRICE_MISMATCH
}

enum DiffSeverity {
  INFO
  WARNING
  CRITICAL
}
```

### 2. Agent Tools

New tools to add to `AiAgentToolName`:

```typescript
// Add to ai-agent.interfaces.ts
export type AiAgentToolName =
  // ... existing tools ...
  | 'import_broker_statement'
  | 'list_statement_imports'
  | 'get_statement_import_details'
  | 'set_symbol_mapping'
  | 'run_reconciliation'
  | 'get_reconciliation_result'
  | 'apply_reconciliation_fix'
  | 'list_symbol_mappings';
```

### 3. API Endpoints

New authenticated endpoints:

```
POST   /api/broker-imports/upload          - Upload broker statement file
GET    /api/broker-imports                 - List all imports
GET    /api/broker-imports/:id             - Get import details
POST   /api/symbol-mappings                - Create symbol mapping
GET    /api/symbol-mappings                - List user's mappings
PUT    /api/symbol-mappings/:id            - Update mapping
DELETE /api/symbol-mappings/:id            - Delete mapping
POST   /api/reconciliation/run             - Start reconciliation
GET    /api/reconciliation/:runId          - Get reconciliation results
POST   /api/reconciliation/:runId/apply    - Apply a fix
```

### 4. Verification Layer

Checks exposed in response:

- `parse_success_rate`: parsed_rows / total_rows (target >= 95%)
- `unknown_symbol_rate`: unknown / total symbols (target < 5%)
- `idempotency_check`: same file hash = no duplicates
- `value_sanity_check`: portfolio value within threshold
- `position_sanity_check`: no negative quantities

### 5. Demo Workflow

```
User: "I uploaded my Schwab statement — is Ghostfolio accurate?"

1. Agent calls list_broker_accounts
2. Agent calls import_broker_statement
3. Detects unknown symbols → asks user to map
4. Agent calls set_symbol_mapping (user confirmed)
5. Agent calls run_reconciliation
6. Agent summarizes diffs + proposes fixes
7. User approves → agent calls apply_reconciliation_fix
8. Re-run reconciliation → status: passed 🟢
```

### 6. Evals Coverage

**Dataset:** [apps/api/src/app/endpoints/ai/evals/dataset/broker-statement.dataset.ts](https://github.com/maxpetrusenko/ghostfolio/blob/main/apps/api/src/app/endpoints/ai/evals/dataset/broker-statement.dataset.ts)

22 test cases (16 happy path, 3 adversarial, 3 edge) — full implementation complete.

Test scenarios:

| Scenario                | Expected Behavior                            |
| ----------------------- | -------------------------------------------- |
| Clean CSV import        | Full parse, 0 errors, reconcile passes       |
| Unknown symbols         | Partial parse, mapping request, user confirm |
| Malformed rows          | Parse with warnings per row, partial import  |
| Missing dividends       | Diff detection, apply_fix creates Order      |
| Quantity mismatch       | Diff detection, applies correct quantity     |
| Duplicate import        | Idempotency check, no new rows added         |
| Prompt injection in CSV | Tool ignores, strict JSON only               |

## Impact

- **Time saved**: ~30 min per statement → <1 min with agent
- **Accuracy**: Automated reconciliation vs manual spot-checks
- **Trust**: Verification checks + audit trail
- **Auditability**: Every import/reconciliation tracked with diffs

## How to Run

```bash
# 1. Apply database migration
npx prisma migrate dev --name add-broker-statement-ingestion

# 2. Build API
npm run build

# 3. Start services
docker-compose up -d

# 4. Test with sample data
curl -X POST http://localhost:3333/api/broker-imports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test/fixtures/schwab-statement.csv"
```

## Reliability Features

- **Verification Checks**: parse rate, idempotency, sanity checks
- **Observability**: All runs logged with timing, status, diffs
- **Evals**: 7+ test scenarios covering happy path + edges
- **Error Handling**: Graceful degradation, partial imports allowed
- **State Persistence**: Full CRUD on imports, mappings, diffs
