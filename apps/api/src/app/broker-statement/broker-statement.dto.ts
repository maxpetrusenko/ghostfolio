import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({ description: 'The broker name' })
  @IsEnum(BrokerName)
  brokerName: BrokerName;

  @ApiProperty({ description: 'Base64 encoded file content or file reference' })
  @IsString()
  fileContent: string;

  @ApiPropertyOptional({ description: 'Original filename' })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({ description: 'SHA256 hash of file for idempotency' })
  @IsString()
  @IsOptional()
  fileHash?: string;

  @ApiPropertyOptional({ description: 'Associated Ghostfolio account ID' })
  @IsString()
  @IsOptional()
  accountId?: string;
}

export class SetSymbolMappingDto {
  @ApiProperty({ description: 'Raw symbol from broker statement' })
  @IsString()
  rawSymbol: string;

  @ApiProperty({ description: 'Broker name' })
  @IsEnum(BrokerName)
  brokerName: BrokerName;

  @ApiProperty({ description: 'Canonical symbol in Ghostfolio' })
  @IsString()
  canonicalSymbol: string;

  @ApiPropertyOptional({ description: 'Confidence score (0-1)' })
  @IsNumber()
  @IsOptional()
  confidence?: number;
}

export class RunReconciliationDto {
  @ApiProperty({ description: 'Import ID to reconcile' })
  @IsString()
  importId: string;

  @ApiPropertyOptional({ description: 'Ghostfolio account ID to reconcile against' })
  @IsString()
  @IsOptional()
  accountId?: string;
}

export class ApplyReconciliationFixDto {
  @ApiProperty({ description: 'Diff ID to apply fix for' })
  @IsString()
  diffId: string;

  @ApiProperty({
    description: 'Action to take',
    enum: ['CREATE_MISSING_TRANSACTION', 'UPDATE_QUANTITY', 'IGNORE']
  })
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
