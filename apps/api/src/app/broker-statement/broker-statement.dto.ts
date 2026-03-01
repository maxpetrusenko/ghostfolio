import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum BrokerName {
  SCHWAB = 'SCHWAB',
  FIDELITY = 'FIDELITY',
  INTERACTIVE_BROKERS = 'INTERACTIVE_BROKERS',
  VANGUARD = 'VANGUARD',
  ETORO = 'ETORO',
  TRADESTATION = 'TRADESTATION',
  OTHER = 'OTHER'
}

export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL',
  DIVIDEND = 'DIVIDEND',
  FEE = 'FEE',
  TAX = 'TAX',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  INTEREST = 'INTEREST',
  FX_CONVERSION = 'FX_CONVERSION'
}

export interface ParsedBrokerTransaction {
  rawSymbol: string;
  rawDescription?: string;
  transactionType: TransactionType;
  tradeDate: Date;
  settleDate?: Date;
  quantity: number;
  price: number;
  grossAmount?: number;
  netAmount?: number;
  currency: string;
  feeAmount?: number;
  taxAmount?: number;
  externalId?: string;
  accountId?: string;
}

export class UploadStatementDto {
  @IsEnum(BrokerName)
  brokerName: BrokerName;

  @IsString()
  fileContent: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsString()
  @IsOptional()
  fileHash?: string;

  @IsString()
  @IsOptional()
  accountId?: string;
}

export class SetSymbolMappingDto {
  @IsString()
  rawSymbol: string;

  @IsEnum(BrokerName)
  brokerName: BrokerName;

  @IsString()
  canonicalSymbol: string;

  @IsNumber()
  @IsOptional()
  confidence?: number;
}

export class RunReconciliationDto {
  @IsString()
  importId: string;

  @IsString()
  @IsOptional()
  accountId?: string;
}

export class ApplyReconciliationFixDto {
  @IsString()
  diffId: string;

  @IsEnum(['CREATE_MISSING_TRANSACTION', 'UPDATE_QUANTITY', 'IGNORE'])
  action: 'CREATE_MISSING_TRANSACTION' | 'UPDATE_QUANTITY' | 'IGNORE';
}

export class ImportDetailsDto {
  id: string;
  fileName: string;
  brokerName: string;
  status: string;
  uploadedAt: Date;
  processedAt?: Date;
  rowCount: number;
  errorCount: number;
  meta?: Record<string, unknown>;
  rows?: StatementRowDto[];
  verification?: VerificationSummaryDto;
}

export class StatementRowDto {
  id: string;
  validationStatus: string;
  errorCodes: string[];
  rawData: Record<string, unknown>;
  parsedData?: ParsedBrokerTransaction;
}

export class SymbolMappingDto {
  id: string;
  rawSymbol: string;
  brokerName: string;
  canonicalSymbol: string;
  confidence: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ReconciliationSummaryDto {
  id: string;
  importId: string;
  accountId?: string;
  status: string;
  runAt: Date;
  completedAt?: Date;
  summary: ReconciliationSummaryData;
  diffs: ReconciliationDiffDto[];
  verification?: VerificationSummaryDto;
}

export interface ReconciliationSummaryData {
  totalDiffs: number;
  criticalDiffs: number;
  warningDiffs: number;
  infoDiffs: number;
  missingTransactions: number;
  quantityMismatches: number;
  missingDividends: number;
  unknownSymbols: number;
  cashMismatch?: number;
  valueMismatch?: number;
}

export class ReconciliationDiffDto {
  id: string;
  diffType: string;
  severity: string;
  details: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: Date;
}

export class VerificationSummaryDto {
  parseSuccessRate: number;
  parseSuccessRateStatus: 'passed' | 'warning' | 'failed';
  unknownSymbolRate: number;
  unknownSymbolRateStatus: 'passed' | 'warning' | 'failed';
  idempotencyCheck: boolean;
  idempotencyCheckStatus: 'passed' | 'warning' | 'failed';
  overallStatus: 'passed' | 'warning' | 'failed';
}

export class BrokerStatementListDto {
  imports: ImportDetailsDto[];
  total: number;
}

export class ReconciliationListDto {
  runs: ReconciliationSummaryDto[];
  total: number;
}

export class SymbolMappingListDto {
  mappings: SymbolMappingDto[];
  total: number;
}
