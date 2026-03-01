import { Injectable } from '@nestjs/common';
import { BrokerName, ParsedBrokerTransaction, TransactionType } from './broker-statement.dto';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';

interface CSVRow extends Record<string, string> {}

interface ParserResult {
  transactions: ParsedBrokerTransaction[];
  errors: { row: number; message: string; rawRow?: CSVRow }[];
  warnings: { row: number; message: string }[];
  rowCount: number;
}

interface BrokerParserConfig {
  requiredColumns: string[];
  columnMapping: Record<string, keyof ParsedBrokerTransaction | string>;
  dateFormats: string[];
  decimalSeparator: '.' | ',';
  hasHeader: boolean;
}

/**
 * Broker-specific CSV parser configurations
 */
const BROKER_CONFIGS: Record<BrokerName, BrokerParserConfig> = {
  [BrokerName.SCHWAB]: {
    requiredColumns: ['Date', 'Action', 'Symbol', 'Quantity', 'Price'],
    columnMapping: {
      'Date': 'tradeDate',
      'Settle Date': 'settleDate',
      'Action': 'transactionType',
      'Symbol': 'rawSymbol',
      'Description': 'rawDescription',
      'Quantity': 'quantity',
      'Price': 'price',
      'Fees': 'feeAmount',
      'Commission': 'feeAmount',
      'Amount': 'netAmount',
      'Currency': 'currency'
    },
    dateFormats: ['MM/DD/YYYY', 'M/D/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.FIDELITY]: {
    requiredColumns: ['Run Date', 'Action', 'Symbol', 'Quantity', 'Price'],
    columnMapping: {
      'Run Date': 'tradeDate',
      'Settlement Date': 'settleDate',
      'Action': 'transactionType',
      'Symbol': 'rawSymbol',
      'Description': 'rawDescription',
      'Quantity': 'quantity',
      'Price': 'price',
      'Commission': 'feeAmount',
      'Amount': 'netAmount',
      'Currency': 'currency'
    },
    dateFormats: ['MM/DD/YYYY', 'M/D/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.INTERACTIVE_BROKERS]: {
    requiredColumns: ['Date', 'Action', 'Symbol', 'Quantity', 'Price'],
    columnMapping: {
      'Date': 'tradeDate',
      'Settlement Date': 'settleDate',
      'Action': 'transactionType',
      'Symbol': 'rawSymbol',
      'Description': 'rawDescription',
      'Quantity': 'quantity',
      'Price': 'price',
      'Commission': 'feeAmount',
      'Net Cash': 'netAmount',
      'Currency': 'currency',
      'Order ID': 'externalId'
    },
    dateFormats: ['YYYY-MM-DD', 'MM/DD/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.VANGUARD]: {
    requiredColumns: ['Trade Date', 'Type', 'Symbol', 'Quantity', 'Price'],
    columnMapping: {
      'Trade Date': 'tradeDate',
      'Settlement Date': 'settleDate',
      'Type': 'transactionType',
      'Symbol': 'rawSymbol',
      'Description': 'rawDescription',
      'Quantity': 'quantity',
      'Price': 'price',
      'Commission': 'feeAmount',
      'Amount': 'netAmount',
      'Currency': 'currency'
    },
    dateFormats: ['MM/DD/YYYY', 'M/D/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.ETRADE]: {
    requiredColumns: ['Date', 'Action', 'Symbol', 'Qty', 'Price'],
    columnMapping: {
      'Date': 'tradeDate',
      'Settlement Date': 'settleDate',
      'Action': 'transactionType',
      'Symbol': 'rawSymbol',
      'Description': 'rawDescription',
      'Qty': 'quantity',
      'Price': 'price',
      'Comm/Fee': 'feeAmount',
      'Amount': 'netAmount',
      'Currency': 'currency'
    },
    dateFormats: ['MM/DD/YYYY', 'M/D/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.TRADESTATION]: {
    requiredColumns: ['Date', 'Type', 'Symbol', 'Qty', 'Price'],
    columnMapping: {
      'Date': 'tradeDate',
      'Settlement Date': 'settleDate',
      'Type': 'transactionType',
      'Symbol': 'rawSymbol',
      'Description': 'rawDescription',
      'Qty': 'quantity',
      'Price': 'price',
      'Commission': 'feeAmount',
      'Amount': 'netAmount',
      'Currency': 'currency'
    },
    dateFormats: ['MM/DD/YYYY', 'M/D/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.OTHER]: {
    requiredColumns: [],
    columnMapping: {},
    dateFormats: ['MM/DD/YYYY', 'YYYY-MM-DD'],
    decimalSeparator: '.',
    hasHeader: true
  }
};

/**
 * Maps broker-specific action names to standard transaction types
 */
const ACTION_TYPE_MAPPING: Record<string, TransactionType> = {
  // Buy actions
  'BUY': TransactionType.BUY,
  'BOUGHT': TransactionType.BUY,
  'BUY TO OPEN': TransactionType.BUY,
  'BUY TO CLOSE': TransactionType.BUY,
  'PURCHASE': TransactionType.BUY,
  'BTO': TransactionType.BUY,

  // Sell actions
  'SELL': TransactionType.SELL,
  'SOLD': TransactionType.SELL,
  'SELL TO CLOSE': TransactionType.SELL,
  'SELL TO OPEN': TransactionType.SELL,
  'SALE': TransactionType.SELL,
  'STC': TransactionType.SELL,
  'SHORT SALE': TransactionType.SELL,

  // Dividend actions
  'DIVIDEND': TransactionType.DIVIDEND,
  'DIV': TransactionType.DIVIDEND,
  'REINVEST DIV': TransactionType.DIVIDEND,
  'DIVIDEND REINVESTMENT': TransactionType.DIVIDEND,
  'QUALIFIED DIVIDEND': TransactionType.DIVIDEND,
  'ORDINARY DIVIDEND': TransactionType.DIVENDEND,

  // Fee actions
  'FEE': TransactionType.FEE,
  'COMMISSION': TransactionType.FEE,
  'MARGIN INTEREST': TransactionType.FEE,

  // Tax actions
  'TAX': TransactionType.TAX,
  'WITHHOLDING': TransactionType.TAX,
  'FOREIGN TAX': TransactionType.TAX,

  // Interest
  'INTEREST': TransactionType.INTEREST,
  'CREDIT INTEREST': TransactionType.INTEREST,
  'DEBIT INTEREST': TransactionType.INTEREST,

  // Transfer
  'TRANSFER IN': TransactionType.TRANSFER_IN,
  'TRANSFER OUT': TransactionType.TRANSFER_OUT,
  'DEPOSIT': TransactionType.TRANSFER_IN,
  'WITHDRAWAL': TransactionType.TRANSFER_OUT,

  // FX
  'FX CONVERSION': TransactionType.FX_CONVERSION,
  'CURRENCY EXCHANGE': TransactionType.FX_CONVERSION
};

@Injectable()
export class BrokerStatementParserService {
  /**
   * Parse CSV content for a specific broker
   */
  async parseCSV(
    fileContent: string,
    brokerName: BrokerName
  ): Promise<ParserResult> {
    const config = BROKER_CONFIGS[brokerName] || BROKER_CONFIGS[BrokerName.OTHER];
    const result: ParserResult = {
      transactions: [],
      errors: [],
      warnings: [],
      rowCount: 0
    };

    let records: CSVRow[];

    try {
      // Detect if base64 encoded
      const csvContent = this.decodeFileContent(fileContent);

      // Parse CSV
      records = parse(csvContent, {
        columns: config.hasHeader,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });

      result.rowCount = records.length;

      if (records.length === 0) {
        result.errors.push({
          row: 0,
          message: 'File appears to be empty or could not be parsed'
        });
        return result;
      }

      // Validate required columns if this is a known broker
      if (brokerName !== BrokerName.OTHER && config.hasHeader) {
        const firstRow = records[0];
        const missingColumns = config.requiredColumns.filter(
          col => !(col in firstRow)
        );

        if (missingColumns.length > 0) {
          result.errors.push({
            row: 1,
            message: `Missing required columns: ${missingColumns.join(', ')}`
          });
        }
      }

      // Parse each row
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 1; // 1-indexed for user display

        try {
          const transaction = this.parseRow(row, config);
          if (transaction) {
            result.transactions.push(transaction);
          }
        } catch (error) {
          result.errors.push({
            row: rowNumber,
            message: error instanceof Error ? error.message : 'Unknown parsing error',
            rawRow: row
          });
        }
      }

    } catch (error) {
      result.errors.push({
        row: 0,
        message: `Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    return result;
  }

  /**
   * Generate file hash for idempotency checking
   */
  generateFileHash(fileContent: string): string {
    const content = this.decodeFileContent(fileContent);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Decode base64 content if needed
   */
  private decodeFileContent(fileContent: string): string {
    // Check if it looks like base64 (no newlines, only valid base64 chars)
    if (!fileContent.includes('\n') && !fileContent.includes(',')) {
      try {
        const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
        // If it looks like CSV after decoding, use it
        if (decoded.includes(',') || decoded.includes('\t')) {
          return decoded;
        }
      } catch {
        // Not base64, use as-is
      }
    }
    return fileContent;
  }

  /**
   * Parse a single CSV row into a ParsedBrokerTransaction
   */
  private parseRow(
    row: CSVRow,
    config: BrokerParserConfig
  ): ParsedBrokerTransaction | null {
    // Skip empty rows
    if (Object.keys(row).length === 0) {
      return null;
    }

    const mapped: Partial<ParsedBrokerTransaction> = {
      rawSymbol: '',
      transactionType: TransactionType.BUY,
      tradeDate: new Date(),
      quantity: 0,
      price: 0,
      currency: 'USD'
    };

    // Map columns according to broker config
    for (const [csvColumn, targetField] of Object.entries(config.columnMapping)) {
      const value = row[csvColumn];
      if (value === undefined || value === '') {
        continue;
      }

      if (targetField === 'tradeDate' || targetField === 'settleDate') {
        (mapped as Record<string, unknown>)[targetField] = this.parseDate(value, config.dateFormats);
      } else if (targetField === 'quantity' || targetField === 'price' || targetField === 'feeAmount' || targetField === 'taxAmount' || targetField === 'grossAmount' || targetField === 'netAmount') {
        (mapped as Record<string, unknown>)[targetField] = this.parseNumber(value, config.decimalSeparator);
      } else {
        (mapped as Record<string, unknown>)[targetField] = value;
      }
    }

    // Normalize transaction type
    if (mapped.rawDescription) {
      const action = this.findTransactionType(mapped.rawDescription, row);
      if (action) {
        mapped.transactionType = action;
      }
    }

    // Try to infer type from various fields
    if (!mapped.transactionType || mapped.transactionType === TransactionType.BUY) {
      const action = this.findTransactionType(
        Object.values(row).join(' ').toUpperCase(),
        row
      );
      if (action) {
        mapped.transactionType = action;
      }
    }

    // Validate required fields
    if (!mapped.rawSymbol) {
      throw new Error('Missing symbol');
    }

    if (isNaN(mapped.tradeDate?.getTime())) {
      throw new Error('Invalid or missing date');
    }

    if (mapped.quantity === undefined || mapped.quantity === null) {
      // Try to derive quantity from amount and price for dividends
      if (mapped.transactionType === TransactionType.DIVIDEND) {
        mapped.quantity = 0; // Dividends don't always have quantity
      } else {
        throw new Error('Missing quantity');
      }
    }

    // Calculate derived amounts if missing
    if (mapped.netAmount === undefined && mapped.quantity !== undefined && mapped.price !== undefined) {
      const grossAmount = mapped.quantity * mapped.price;
      mapped.grossAmount = grossAmount;
      mapped.netAmount = grossAmount - (mapped.feeAmount || 0) - (mapped.taxAmount || 0);
    }

    return mapped as ParsedBrokerTransaction;
  }

  /**
   * Parse date trying multiple formats
   */
  private parseDate(dateStr: string, formats: string[]): Date {
    const cleanStr = dateStr.trim();

    for (const format of formats) {
      try {
        if (format === 'MM/DD/YYYY' || format === 'M/D/YYYY') {
          const parts = cleanStr.split('/');
          if (parts.length === 3) {
            const month = parseInt(parts[0], 10) - 1;
            const day = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
              return date;
            }
          }
        } else if (format === 'YYYY-MM-DD') {
          const date = new Date(cleanStr);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      } catch {
        continue;
      }
    }

    // Fallback to native Date parsing
    const fallback = new Date(cleanStr);
    if (!isNaN(fallback.getTime())) {
      return fallback;
    }

    throw new Error(`Could not parse date: ${dateStr}`);
  }

  /**
   * Parse number with locale-specific decimal separator
   */
  private parseNumber(numStr: string, decimalSeparator: '.' | ','): number {
    const clean = numStr.trim().replace(/,/g, ''); // Remove thousands separators

    // Handle European format (comma as decimal)
    if (decimalSeparator === ',') {
      const withDot = clean.replace(',', '.');
      const parsed = parseFloat(withDot);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }

    const parsed = parseFloat(clean);
    if (isNaN(parsed)) {
      throw new Error(`Could not parse number: ${numStr}`);
    }
    return parsed;
  }

  /**
   * Find transaction type from action text
   */
  private findTransactionType(actionText: string, row: CSVRow): TransactionType | null {
    const normalized = actionText.toUpperCase().trim();

    // Direct match
    if (ACTION_TYPE_MAPPING[normalized]) {
      return ACTION_TYPE_MAPPING[normalized];
    }

    // Partial match
    for (const [key, value] of Object.entries(ACTION_TYPE_MAPPING)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return value;
      }
    }

    // Heuristics based on row content
    if (normalized.includes('DIV') || row['Description']?.toUpperCase().includes('DIVIDEND')) {
      return TransactionType.DIVIDEND;
    }

    if (normalized.includes('SELL') || normalized.includes('STC') || normalized.includes('SHORT')) {
      return TransactionType.SELL;
    }

    return TransactionType.BUY; // Default
  }

  /**
   * Detect broker from CSV content (heuristic)
   */
  detectBroker(fileContent: string): BrokerName {
    const csvContent = this.decodeFileContent(fileContent).toLowerCase();

    // Check for broker-specific patterns in headers
    if (csvContent.includes('settlement date') && csvContent.includes('principal')) {
      return BrokerName.FIDELITY;
    }
    if (csvContent.includes('settle date') && csvContent.includes('confirmation')) {
      return BrokerName.SCHWAB;
    }
    if (csvContent.includes('order id') && csvContent.includes('ibkr')) {
      return BrokerName.INTERACTIVE_BROKERS;
    }
    if (csvContent.includes('vanguard') && csvContent.includes('investment')) {
      return BrokerName.VANGUARD;
    }
    if (csvContent.includes('etrade')) {
      return BrokerName.ETRADE;
    }
    if (csvContent.includes('tradestation')) {
      return BrokerName.TRADESTATION;
    }

    return BrokerName.OTHER;
  }
}
