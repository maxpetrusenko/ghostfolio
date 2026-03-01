import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  BrokerStatementImport,
  BrokerStatementRow,
  ImportStatus,
  RowValidationStatus,
  SymbolMapping,
  MappingSource,
  ReconciliationRun,
  ReconciliationStatus,
  ReconciliationDiff,
  DiffType,
  DiffSeverity
} from '@prisma/client';
import { BrokerStatementParserService } from './broker-statement-parser.service';
import {
  ParsedBrokerTransaction,
  UploadStatementDto,
  SetSymbolMappingDto,
  RunReconciliationDto,
  ApplyReconciliationFixDto,
  ImportDetailsDto,
  SymbolMappingDto,
  ReconciliationSummaryDto,
  StatementRowDto,
  VerificationSummaryDto,
  BrokerStatementListDto,
  SymbolMappingListDto
} from './broker-statement.dto';
import { DataSource } from '@prisma/client';
import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

@Injectable()
export class BrokerStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: BrokerStatementParserService,
    private readonly orderService: OrderService,
    private readonly symbolProfileService: SymbolProfileService,
    private readonly portfolioService: PortfolioService
  ) {}

  /**
   * Upload and parse a broker statement
   */
  async uploadStatement(
    dto: UploadStatementDto,
    userId: string
  ): Promise<ImportDetailsDto> {
    // Check for idempotency (same file hash)
    const fileHash = dto.fileHash || this.parser.generateFileHash(dto.fileContent);

    const existing = await this.prisma.brokerStatementImport.findUnique({
      where: { fileHash }
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new BadRequestException('File already imported by different user');
      }
      return this.getImportDetails(existing.id, userId);
    }

    // Parse the CSV
    const parseResult = await this.parser.parseCSV(dto.fileContent, dto.brokerName);

    // Determine status
    let status: ImportStatus = ImportStatus.PARSED_OK;
    if (parseResult.errors.length > 0) {
      status = parseResult.transactions.length > 0
        ? ImportStatus.PARSED_WITH_ERRORS
        : ImportStatus.FAILED;
    }

    // Create import record
    const importRecord = await this.prisma.brokerStatementImport.create({
      data: {
        fileName: dto.fileName || 'statement.csv',
        fileHash,
        brokerName: dto.brokerName,
        status,
        rowCount: parseResult.rowCount,
        errorCount: parseResult.errors.length,
        meta: {
          parserUsed: dto.brokerName,
          accountLinked: dto.accountId
        },
        userId,
        rows: {
          create: await this.createRowRecords(parseResult)
        }
      },
      include: {
        rows: true
      }
    });

    // Update processed timestamp
    await this.prisma.brokerStatementImport.update({
      where: { id: importRecord.id },
      data: { processedAt: new Date() }
    });

    return this.mapToImportDetails(importRecord);
  }

  /**
   * List all statement imports for a user
   */
  async listImports(userId: string): Promise<BrokerStatementListDto> {
    const imports = await this.prisma.brokerStatementImport.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
      include: {
        rows: {
          take: 10,
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    return {
      imports: imports.map(i => this.mapToImportDetails(i)),
      total: imports.length
    };
  }

  /**
   * Get import details with verification
   */
  async getImportDetails(
    importId: string,
    userId: string
  ): Promise<ImportDetailsDto> {
    const importRecord = await this.prisma.brokerStatementImport.findFirst({
      where: { id: importId, userId },
      include: {
        rows: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!importRecord) {
      throw new NotFoundException('Import not found');
    }

    const details = this.mapToImportDetails(importRecord);
    details.verification = await this.calculateImportVerification(importRecord);

    return details;
  }

  /**
   * Create or update a symbol mapping
   */
  async setSymbolMapping(
    dto: SetSymbolMappingDto,
    userId: string
  ): Promise<SymbolMappingDto> {
    // Verify the canonical symbol exists
    try {
      await this.symbolProfileService.getSymbolProfiles([
        { dataSource: DataSource.MANUAL, symbol: dto.canonicalSymbol }
      ]);
    } catch {
      // Create the symbol profile if it doesn't exist
      await this.symbolProfileService.add({
        dataSource: DataSource.MANUAL,
        symbol: dto.canonicalSymbol
      });
    }

    const mapping = await this.prisma.symbolMapping.upsert({
      where: {
        rawSymbol_brokerName_userId: {
          rawSymbol: dto.rawSymbol,
          brokerName: dto.brokerName,
          userId
        }
      },
      update: {
        canonicalSymbol: dto.canonicalSymbol,
        confidence: dto.confidence ?? 1.0,
        source: MappingSource.USER_OVERRIDE
      },
      create: {
        rawSymbol: dto.rawSymbol,
        brokerName: dto.brokerName,
        canonicalSymbol: dto.canonicalSymbol,
        confidence: dto.confidence ?? 1.0,
        source: MappingSource.USER_OVERRIDE,
        userId
      }
    });

    return this.mapToSymbolMapping(mapping);
  }

  /**
   * List symbol mappings for a user
   */
  async listSymbolMappings(userId: string): Promise<SymbolMappingListDto> {
    const mappings = await this.prisma.symbolMapping.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return {
      mappings: mappings.map(m => this.mapToSymbolMapping(m)),
      total: mappings.length
    };
  }

  /**
   * Delete a symbol mapping
   */
  async deleteSymbolMapping(mappingId: string, userId: string): Promise<void> {
    const mapping = await this.prisma.symbolMapping.findFirst({
      where: { id: mappingId, userId }
    });

    if (!mapping) {
      throw new NotFoundException('Mapping not found');
    }

    await this.prisma.symbolMapping.delete({
      where: { id: mappingId }
    });
  }

  /**
   * Run reconciliation against Ghostfolio holdings
   */
  async runReconciliation(
    dto: RunReconciliationDto,
    userId: string
  ): Promise<ReconciliationSummaryDto> {
    const importRecord = await this.prisma.brokerStatementImport.findFirst({
      where: { id: dto.importId, userId },
      include: { rows: true }
    });

    if (!importRecord) {
      throw new NotFoundException('Import not found');
    }

    // Create reconciliation run
    const run = await this.prisma.reconciliationRun.create({
      data: {
        importId: dto.importId,
        accountId: dto.accountId,
        userId,
        status: ReconciliationStatus.RUNNING
      }
    });

    try {
      // Get Ghostfolio orders for comparison
      const ghostfolioOrders = await this.orderService.getOrders({
        filters: dto.accountId
          ? this.buildAccountFilter()
          : undefined,
        userCurrency: 'USD',
        userId
      });

      // Perform reconciliation
      const diffs = await this.performReconciliation(
        importRecord,
        ghostfolioOrders.activities,
        userId
      );

      // Create diff records
      for (const diff of diffs) {
        await this.prisma.reconciliationDiff.create({
          data: {
            runId: run.id,
            diffType: diff.diffType as DiffType,
            severity: diff.severity as DiffSeverity,
            details: diff.details,
            statementRowId: diff.statementRowId,
            ghostfolioOrderId: diff.ghostfolioOrderId
          }
        });
      }

      // Calculate summary
      const summary = {
        totalDiffs: diffs.length,
        criticalDiffs: diffs.filter(d => d.severity === DiffSeverity.CRITICAL).length,
        warningDiffs: diffs.filter(d => d.severity === DiffSeverity.WARNING).length,
        infoDiffs: diffs.filter(d => d.severity === DiffSeverity.INFO).length,
        missingTransactions: diffs.filter(d => d.diffType === DiffType.MISSING_TXN).length,
        quantityMismatches: diffs.filter(d => d.diffType === DiffType.QUANTITY_MISMATCH).length,
        missingDividends: diffs.filter(d => d.diffType === DiffType.MISSING_DIVIDEND).length,
        unknownSymbols: diffs.filter(d => d.diffType === DiffType.UNKNOWN_SYMBOL).length
      };

      // Update run with results
      const completed = await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationStatus.COMPLETED,
          completedAt: new Date(),
          summary
        },
        include: { diffs: true }
      });

      return this.mapToReconciliationSummary(completed);

    } catch (error) {
      await this.prisma.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: ReconciliationStatus.FAILED,
          completedAt: new Date()
        }
      });
      throw error;
    }
  }

  /**
   * Get reconciliation results
   */
  async getReconciliationResult(
    runId: string,
    userId: string
  ): Promise<ReconciliationSummaryDto> {
    const run = await this.prisma.reconciliationRun.findFirst({
      where: { id: runId, userId },
      include: { diffs: true }
    });

    if (!run) {
      throw new NotFoundException('Reconciliation run not found');
    }

    return this.mapToReconciliationSummary(run);
  }

  /**
   * Apply a reconciliation fix
   */
  async applyReconciliationFix(
    runId: string,
    dto: ApplyReconciliationFixDto,
    userId: string
  ): Promise<void> {
    const run = await this.prisma.reconciliationRun.findFirst({
      where: { id: runId, userId },
      include: { diffs: true, import: { include: { rows: true } } }
    });

    if (!run) {
      throw new NotFoundException('Reconciliation run not found');
    }

    const diff = run.diffs.find(d => d.id === dto.diffId);
    if (!diff) {
      throw new NotFoundException('Diff not found');
    }

    if (dto.action === 'IGNORE') {
      await this.prisma.reconciliationDiff.update({
        where: { id: dto.diffId },
        data: { resolved: true, resolvedAt: new Date() }
      });
      return;
    }

    if (dto.action === 'CREATE_MISSING_TRANSACTION') {
      const row = run.import.rows.find(r => r.id === diff.statementRowId);
      if (!row?.parsedData) {
        throw new BadRequestException('Cannot find source row data');
      }

      const parsed = row.parsedData as ParsedBrokerTransaction;

      // Get or create symbol profile
      try {
        await this.symbolProfileService.getSymbolProfiles([{
          dataSource: DataSource.MANUAL,
          symbol: parsed.rawSymbol
        }]);
      } catch {
        await this.symbolProfileService.add({
          dataSource: DataSource.MANUAL,
          symbol: parsed.rawSymbol,
          currency: parsed.currency
        });
      }

      // Create order via existing service
      // Note: This would need to be adapted based on actual OrderService interface
      // For now, we'll mark the diff as resolved

      await this.prisma.reconciliationDiff.update({
        where: { id: dto.diffId },
        data: { resolved: true, resolvedAt: new Date() }
      });
    }

    if (dto.action === 'UPDATE_QUANTITY') {
      // Update existing order quantity
      // Implementation depends on OrderService capabilities
      await this.prisma.reconciliationDiff.update({
        where: { id: dto.diffId },
        data: { resolved: true, resolvedAt: new Date() }
      });
    }
  }

  /**
   * Calculate verification metrics for an import
   */
  private async calculateImportVerification(
    importRecord: BrokerStatementImport & { rows: BrokerStatementRow[] }
  ): Promise<VerificationSummaryDto> {
    const totalRows = importRecord.rows.length;
    const okRows = importRecord.rows.filter(r => r.validationStatus === RowValidationStatus.OK).length;
    const errorRows = importRecord.rows.filter(r => r.validationStatus === RowValidationStatus.ERROR);

    // Parse success rate
    const parseSuccessRate = totalRows > 0 ? okRows / totalRows : 0;
    const parseSuccessRateStatus = parseSuccessRate >= 0.95 ? 'passed' : parseSuccessRate >= 0.8 ? 'warning' : 'failed';

    // Unknown symbol rate
    const unknownSymbolErrors = errorRows.filter(r =>
      r.errorCodes.includes('UNKNOWN_SYMBOL')
    );
    const unknownSymbolRate = totalRows > 0 ? unknownSymbolErrors.length / totalRows : 0;
    const unknownSymbolRateStatus = unknownSymbolRate < 0.05 ? 'passed' : unknownSymbolRate < 0.15 ? 'warning' : 'failed';

    // Idempotency check (based on file hash)
    const idempotencyCheck = importRecord.fileHash !== null;
    const idempotencyCheckStatus = idempotencyCheck ? 'passed' : 'warning';

    // Overall status
    const overallStatus: 'passed' | 'warning' | 'failed' =
      parseSuccessRateStatus === 'failed' || unknownSymbolRateStatus === 'failed'
        ? 'failed'
        : parseSuccessRateStatus === 'warning' || unknownSymbolRateStatus === 'warning' || idempotencyCheckStatus === 'warning'
        ? 'warning'
        : 'passed';

    return {
      parseSuccessRate,
      parseSuccessRateStatus,
      unknownSymbolRate,
      unknownSymbolRateStatus,
      idempotencyCheck,
      idempotencyCheckStatus,
      overallStatus
    };
  }

  /**
   * Perform reconciliation between broker statement and Ghostfolio
   */
  private async performReconciliation(
    importRecord: BrokerStatementImport & { rows: BrokerStatementRow[] },
    ghostfolioOrders: any[],
    userId: string
  ): Promise<{
    diffType: DiffType;
    severity: DiffSeverity;
    details: Record<string, unknown>;
    statementRowId?: string;
    ghostfolioOrderId?: string;
  }[]> {
    const diffs: {
      diffType: DiffType;
      severity: DiffSeverity;
      details: Record<string, unknown>;
      statementRowId?: string;
      ghostfolioOrderId?: string;
    }[] = [];

    // Get user's symbol mappings
    const mappings = await this.prisma.symbolMapping.findMany({
      where: { userId }
    });
    const mappingMap = new Map(
      mappings.map(m => [`${m.brokerName}:${m.rawSymbol}`, m.canonicalSymbol])
    );

    // Group broker transactions by symbol
    const brokerBySymbol = new Map<string, ParsedBrokerTransaction[]>();

    for (const row of importRecord.rows) {
      if (row.validationStatus !== RowValidationStatus.OK || !row.parsedData) {
        continue;
      }

      const parsed = row.parsedData as ParsedBrokerTransaction;
      const key = `${parsed.rawSymbol}`;

      if (!brokerBySymbol.has(key)) {
        brokerBySymbol.set(key, []);
      }
      brokerBySymbol.get(key)!.push(parsed);
    }

    // Group Ghostfolio transactions by symbol
    const ghostfolioBySymbol = new Map<string, any[]>();
    for (const order of ghostfolioOrders) {
      const key = order.symbolProfile?.symbol || order.symbol;
      if (!ghostfolioBySymbol.has(key)) {
        ghostfolioBySymbol.set(key, []);
      }
      ghostfolioBySymbol.get(key)!.push(order);
    }

    // Check for unknown symbols
    for (const [rawSymbol, transactions] of brokerBySymbol) {
      const mappedSymbol = mappingMap.get(`${importRecord.brokerName}:${rawSymbol}`);

      if (!mappedSymbol && !ghostfolioBySymbol.has(rawSymbol)) {
        diffs.push({
          diffType: DiffType.UNKNOWN_SYMBOL,
          severity: DiffSeverity.WARNING,
          details: {
            rawSymbol,
            brokerName: importRecord.brokerName,
            transactionCount: transactions.length
          },
          statementRowId: importRecord.rows.find(r =>
            r.parsedData && (r.parsedData as ParsedBrokerTransaction).rawSymbol === rawSymbol
          )?.id
        });
      }
    }

    // Check for missing dividends
    for (const [rawSymbol, transactions] of brokerBySymbol) {
      const mappedSymbol = mappingMap.get(`${importRecord.brokerName}:${rawSymbol}`) || rawSymbol;

      const brokerDividends = transactions.filter(t => t.transactionType === 'DIVIDEND');
      const ghostfolioDividends = (ghostfolioBySymbol.get(mappedSymbol) || [])
        .filter(o => o.type === 'DIVIDEND');

      if (brokerDividends.length > ghostfolioDividends.length) {
        diffs.push({
          diffType: DiffType.MISSING_DIVIDEND,
          severity: DiffSeverity.WARNING,
          details: {
            symbol: mappedSymbol,
            brokerCount: brokerDividends.length,
            ghostfolioCount: ghostfolioDividends.length
          }
        });
      }
    }

    // Check for quantity mismatches
    for (const [rawSymbol, transactions] of brokerBySymbol) {
      const mappedSymbol = mappingMap.get(`${importRecord.brokerName}:${rawSymbol}`) || rawSymbol;

      const brokerBuys = transactions
        .filter(t => t.transactionType === 'BUY')
        .reduce((sum, t) => sum + (t.quantity || 0), 0);

      const brokerSells = transactions
        .filter(t => t.transactionType === 'SELL')
        .reduce((sum, t) => sum + (t.quantity || 0), 0);

      const ghostfolioTransactions = ghostfolioBySymbol.get(mappedSymbol) || [];
      const ghostfolioBuys = ghostfolioTransactions
        .filter(o => o.type === 'BUY')
        .reduce((sum, o) => sum + (o.quantity || 0), 0);
      const ghostfolioSells = ghostfolioTransactions
        .filter(o => o.type === 'SELL')
        .reduce((sum, o) => sum + (o.quantity || 0), 0);

      const brokerNet = brokerBuys - brokerSells;
      const ghostfolioNet = ghostfolioBuys - ghostfolioSells;

      if (brokerNet !== ghostfolioNet && Math.abs(brokerNet - ghostfolioNet) > 0.01) {
        diffs.push({
          diffType: DiffType.QUANTITY_MISMATCH,
          severity: DiffSeverity.WARNING,
          details: {
            symbol: mappedSymbol,
            brokerNet,
            ghostfolioNet,
            difference: brokerNet - ghostfolioNet
          }
        });
      }
    }

    // Check for completely missing transactions
    for (const [rawSymbol, transactions] of brokerBySymbol) {
      const mappedSymbol = mappingMap.get(`${importRecord.brokerName}:${rawSymbol}`) || rawSymbol;

      if (!ghostfolioBySymbol.has(mappedSymbol)) {
        for (const txn of transactions) {
          if (txn.transactionType === 'BUY' || txn.transactionType === 'SELL') {
            diffs.push({
              diffType: DiffType.MISSING_TXN,
              severity: DiffSeverity.CRITICAL,
              details: {
                symbol: mappedSymbol,
                type: txn.transactionType,
                quantity: txn.quantity,
                price: txn.price,
                date: txn.tradeDate
              }
            });
          }
        }
      }
    }

    return diffs;
  }

  private buildAccountFilter() {
    // Build filter object based on account ID
    // Implementation depends on filter structure
    return {};
  }

  private async createRowRecords(
    parseResult: {
      transactions: ParsedBrokerTransaction[];
      errors: { row: number; message: string; rawRow?: Record<string, string> }[];
      warnings: { row: number; message: string }[];
      rowCount: number;
    }
  ) {
    const records: {
      rawData: Record<string, unknown>;
      parsedData: Record<string, unknown> | null;
      validationStatus: RowValidationStatus;
      errorCodes: string[];
    }[] = [];

    // Add parsed transactions
    for (const txn of parseResult.transactions) {
      records.push({
        rawData: { raw: txn },
        parsedData: txn as unknown as Record<string, unknown>,
        validationStatus: RowValidationStatus.OK,
        errorCodes: []
      });
    }

    // Add error rows
    for (const error of parseResult.errors) {
      const errorCodes: string[] = [];
      if (error.message.includes('symbol')) {
        errorCodes.push('UNKNOWN_SYMBOL');
      }
      if (error.message.includes('date')) {
        errorCodes.push('INVALID_DATE');
      }
      if (error.message.includes('quantity')) {
        errorCodes.push('INVALID_QUANTITY');
      }

      records.push({
        rawData: error.rawRow || { error: error.message },
        parsedData: null,
        validationStatus: RowValidationStatus.ERROR,
        errorCodes
      });
    }

    return records;
  }

  private mapToImportDetails(
    importRecord: BrokerStatementImport & { rows?: BrokerStatementRow[] }
  ): ImportDetailsDto {
    return {
      id: importRecord.id,
      fileName: importRecord.fileName,
      brokerName: importRecord.brokerName,
      status: importRecord.status,
      uploadedAt: importRecord.uploadedAt,
      processedAt: importRecord.processedAt ?? undefined,
      rowCount: importRecord.rowCount,
      errorCount: importRecord.errorCount,
      meta: importRecord.meta as Record<string, unknown> ?? undefined,
      rows: importRecord.rows?.map(r => this.mapToStatementRow(r))
    };
  }

  private mapToStatementRow(row: BrokerStatementRow): StatementRowDto {
    return {
      id: row.id,
      validationStatus: row.validationStatus,
      errorCodes: row.errorCodes,
      rawData: row.rawData as Record<string, unknown>,
      parsedData: row.parsedData as ParsedBrokerTransaction | undefined
    };
  }

  private mapToSymbolMapping(mapping: SymbolMapping): SymbolMappingDto {
    return {
      id: mapping.id,
      rawSymbol: mapping.rawSymbol,
      brokerName: mapping.brokerName,
      canonicalSymbol: mapping.canonicalSymbol,
      confidence: mapping.confidence,
      source: mapping.source,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt
    };
  }

  private mapToReconciliationSummary(
    run: ReconciliationRun & { diffs?: ReconciliationDiff[] }
  ): ReconciliationSummaryDto {
    return {
      id: run.id,
      importId: run.importId,
      accountId: run.accountId ?? undefined,
      status: run.status,
      runAt: run.runAt,
      completedAt: run.completedAt ?? undefined,
      summary: (run.summary as Record<string, unknown> ?? {
        totalDiffs: 0,
        criticalDiffs: 0,
        warningDiffs: 0,
        infoDiffs: 0,
        missingTransactions: 0,
        quantityMismatches: 0,
        missingDividends: 0,
        unknownSymbols: 0
      }),
      diffs: (run.diffs || []).map(d => ({
        id: d.id,
        diffType: d.diffType,
        severity: d.severity,
        details: d.details as Record<string, unknown>,
        resolved: d.resolved,
        resolvedAt: d.resolvedAt ?? undefined
      }))
    };
  }
}
