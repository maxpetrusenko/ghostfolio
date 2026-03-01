import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import {
  BrokerName,
  ParsedBrokerTransaction,
  TransactionType
} from './broker-statement.dto';

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
const BROKER_CONFIGS: Record<string, BrokerParserConfig> = {
  [BrokerName.SCHWAB]: {
    requiredColumns: ['Date', 'Action', 'Symbol', 'Quantity', 'Price'],
    columnMapping: {
      Date: 'tradeDate',
      'Settle Date': 'settleDate',
      Action: 'transactionType',
      Symbol: 'rawSymbol',
      Description: 'rawDescription',
      Quantity: 'quantity',
      Price: 'price',
      Fees: 'feeAmount',
      Commission: 'feeAmount',
      Amount: 'netAmount',
      Currency: 'currency'
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
      Action: 'transactionType',
      Symbol: 'rawSymbol',
      Description: 'rawDescription',
      Quantity: 'quantity',
      Price: 'price',
      Commission: 'feeAmount',
      Amount: 'netAmount',
      Currency: 'currency'
    },
    dateFormats: ['MM/DD/YYYY', 'M/D/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.INTERACTIVE_BROKERS]: {
    requiredColumns: ['Date', 'Action', 'Symbol', 'Quantity', 'Price'],
    columnMapping: {
      Date: 'tradeDate',
      'Settlement Date': 'settleDate',
      Action: 'transactionType',
      Symbol: 'rawSymbol',
      Description: 'rawDescription',
      Quantity: 'quantity',
      Price: 'price',
      Commission: 'feeAmount',
      'Net Cash': 'netAmount',
      Currency: 'currency',
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
      Type: 'transactionType',
      Symbol: 'rawSymbol',
      Description: 'rawDescription',
      Quantity: 'quantity',
      Price: 'price',
      Commission: 'feeAmount',
      Amount: 'netAmount',
      Currency: 'currency'
    },
    dateFormats: ['MM/DD/YYYY', 'M/D/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.ETORO]: {
    requiredColumns: ['Date', 'Action', 'Symbol', 'Qty', 'Price'],
    columnMapping: {
      Date: 'tradeDate',
      'Settlement Date': 'settleDate',
      Action: 'transactionType',
      Symbol: 'rawSymbol',
      Description: 'rawDescription',
      Qty: 'quantity',
      Price: 'price',
      'Comm/Fee': 'feeAmount',
      Amount: 'netAmount',
      Currency: 'currency'
    },
    dateFormats: ['MM/DD/YYYY', 'M/D/YYYY'],
    decimalSeparator: '.',
    hasHeader: true
  },
  [BrokerName.TRADESTATION]: {
    requiredColumns: ['Date', 'Type', 'Symbol', 'Qty', 'Price'],
    columnMapping: {
      Date: 'tradeDate',
      'Settlement Date': 'settleDate',
      Type: 'transactionType',
      Symbol: 'rawSymbol',
      Description: 'rawDescription',
      Qty: 'quantity',
      Price: 'price',
      Commission: 'feeAmount',
      Amount: 'netAmount',
      Currency: 'currency'
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
  BUY: TransactionType.BUY,
  BOUGHT: TransactionType.BUY,
  'BUY TO OPEN': TransactionType.BUY,
  'BUY TO CLOSE': TransactionType.BUY,
  PURCHASE: TransactionType.BUY,
  BTO: TransactionType.BUY,

  // Sell actions
  SELL: TransactionType.SELL,
  SOLD: TransactionType.SELL,
  'SELL TO CLOSE': TransactionType.SELL,
  'SELL TO OPEN': TransactionType.SELL,
  SALE: TransactionType.SELL,
  STC: TransactionType.SELL,
  'SHORT SALE': TransactionType.SELL,

  // Dividend actions
  DIVIDEND: TransactionType.DIVIDEND,
  DIV: TransactionType.DIVIDEND,
  'REINVEST DIV': TransactionType.DIVIDEND,
  'DIVIDEND REINVESTMENT': TransactionType.DIVIDEND,
  'QUALIFIED DIVIDEND': TransactionType.DIVIDEND,
  'ORDINARY DIVIDEND': TransactionType.DIVIDEND,

  // Fee actions
  FEE: TransactionType.FEE,
  COMMISSION: TransactionType.FEE,
  'MARGIN INTEREST': TransactionType.FEE,

  // Tax actions
  TAX: TransactionType.TAX,
  WITHHOLDING: TransactionType.TAX,
  'FOREIGN TAX': TransactionType.TAX,

  // Interest
  INTEREST: TransactionType.INTEREST,
  'CREDIT INTEREST': TransactionType.INTEREST,
  'DEBIT INTEREST': TransactionType.INTEREST,

  // Transfer
  'TRANSFER IN': TransactionType.TRANSFER_IN,
  'TRANSFER OUT': TransactionType.TRANSFER_OUT,
  DEPOSIT: TransactionType.TRANSFER_IN,
  WITHDRAWAL: TransactionType.TRANSFER_OUT,

  // FX
  'FX CONVERSION': TransactionType.FX_CONVERSION,
  'CURRENCY EXCHANGE': TransactionType.FX_CONVERSION
};

/**
 * Simple CSV parser - handles quoted fields and basic CSV format
 */
function parseCSV(content: string): string[][] {
  const result: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"'; // Escaped quote
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField);
        if (currentRow.some((f) => f.trim() !== '')) {
          result.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++; // Skip \n
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField);
        if (currentRow.some((f) => f.trim() !== '')) {
          result.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Add last field and row
  if (currentField || inQuotes) {
    currentRow.push(currentField);
  }
  if (currentRow.some((f) => f.trim() !== '')) {
    result.push(currentRow);
  }

  return result;
}

/**
 * Convert parsed CSV rows to objects with headers
 */
function rowsToObjects(rows: string[][]): CSVRow[] {
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((h) => h.trim());
  const result: CSVRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row: CSVRow = {};
    for (let j = 0; j < headers.length && j < rows[i].length; j++) {
      row[headers[j]] = rows[i][j]?.trim() || '';
    }
    result.push(row);
  }

  return result;
}

@Injectable()
export class BrokerStatementParserService {
  /**
   * Parse CSV content for a specific broker
   */
  async parseCSV(
    fileContent: string,
    brokerName: BrokerName
  ): Promise<ParserResult> {
    const config =
      BROKER_CONFIGS[brokerName] || BROKER_CONFIGS[BrokerName.OTHER];
    const result: ParserResult = {
      transactions: [],
      errors: [],
      warnings: [],
      rowCount: 0
    };

    try {
      // Detect if base64 encoded
      const csvContent = this.decodeFileContent(fileContent);

      // Parse CSV
      const parsedRows = parseCSV(csvContent);
      const records =
        config.hasHeader && parsedRows.length > 0
          ? rowsToObjects(parsedRows)
          : parsedRows.map(
              (row) =>
                ({
                  '0': row[0] || '',
                  '1': row[1] || '',
                  '2': row[2] || '',
                  '3': row[3] || '',
                  '4': row[4] || ''
                }) as CSVRow
            );

      result.rowCount = records.length;

      if (records.length === 0) {
        result.errors.push({
          row: 0,
          message: 'File appears to be empty or could not be parsed'
        });
        return result;
      }

      // Validate required columns if this is a known broker
      if (
        brokerName !== BrokerName.OTHER &&
        config.hasHeader &&
        parsedRows.length > 0
      ) {
        const headers = parsedRows[0];
        const missingColumns = config.requiredColumns.filter(
          (col) => !headers.includes(col)
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
            message:
              error instanceof Error ? error.message : 'Unknown parsing error',
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
        return Buffer.from(fileContent, 'base64').toString('utf-8');
      } catch {
        // If decoding fails, assume it's already decoded
        return fileContent;
      }
    }
    return fileContent;
  }

  /**
   * Parse a single CSV row into a transaction
   */
  private parseRow(
    row: CSVRow,
    config: BrokerParserConfig
  ): ParsedBrokerTransaction | null {
    // Get the raw action string
    const rawAction = row['Action'] || row['Type'] || '';
    const transactionType = ACTION_TYPE_MAPPING[rawAction.toUpperCase()];

    if (!transactionType) {
      throw new Error(`Unknown transaction type: ${rawAction}`);
    }

    // Parse quantity
    const quantityField =
      this.findMappedField(row, config, 'quantity') ||
      row['Quantity'] ||
      row['Qty'];
    const quantity = quantityField
      ? parseFloat(quantityField.replace(/,/g, ''))
      : 0;

    if (isNaN(quantity)) {
      throw new Error(`Invalid quantity: ${quantityField}`);
    }

    // Parse price
    const priceField =
      this.findMappedField(row, config, 'price') || row['Price'];
    const price = priceField ? parseFloat(priceField.replace(/,/g, '')) : 0;

    if (isNaN(price)) {
      throw new Error(`Invalid price: ${priceField}`);
    }

    // Parse date
    const dateField =
      this.findMappedField(row, config, 'tradeDate') ||
      row['Date'] ||
      row['Trade Date'] ||
      row['Run Date'];
    const tradeDate = this.parseDate(dateField, config.dateFormats);

    if (!tradeDate) {
      throw new Error(`Invalid date: ${dateField}`);
    }

    // Parse settlement date (optional)
    const settleDateField =
      this.findMappedField(row, config, 'settleDate') ||
      row['Settle Date'] ||
      row['Settlement Date'];
    const settleDate = settleDateField
      ? this.parseDate(settleDateField, config.dateFormats)
      : undefined;

    // Get symbol
    const symbolField =
      this.findMappedField(row, config, 'rawSymbol') || row['Symbol'];
    const rawSymbol = symbolField?.trim() || '';

    if (!rawSymbol) {
      throw new Error('Missing symbol');
    }

    // Parse amounts (optional)
    const netAmountField = row['Amount'] || row['Net Cash'];
    const netAmount = netAmountField
      ? parseFloat(netAmountField.replace(/,/g, ''))
      : undefined;

    const feeAmountField =
      this.findMappedField(row, config, 'feeAmount') ||
      row['Commission'] ||
      row['Fees'] ||
      row['Comm/Fee'];
    const feeAmount = feeAmountField
      ? Math.abs(parseFloat(feeAmountField.replace(/,/g, '')))
      : undefined;

    // Build transaction
    return {
      rawSymbol,
      rawDescription: row['Description'] || undefined,
      transactionType,
      tradeDate,
      settleDate,
      quantity,
      price,
      netAmount,
      feeAmount,
      currency: row['Currency'] || 'USD',
      externalId: row['Order ID'] || undefined
    };
  }

  /**
   * Find a field value using the column mapping
   */
  private findMappedField(
    row: CSVRow,
    config: BrokerParserConfig,
    targetField: string
  ): string | undefined {
    for (const [csvColumn, mappedField] of Object.entries(
      config.columnMapping
    )) {
      if (mappedField === targetField && row[csvColumn] !== undefined) {
        return row[csvColumn];
      }
    }
    return undefined;
  }

  /**
   * Parse date using multiple format attempts
   */
  private parseDate(
    dateStr: string | undefined,
    formats: string[]
  ): Date | undefined {
    if (!dateStr) {
      return undefined;
    }

    dateStr = dateStr.trim();

    // Try each format
    for (const format of formats) {
      try {
        const parsed = this.tryParseDate(dateStr, format);
        if (parsed) {
          return parsed;
        }
      } catch {
        // Continue to next format
      }
    }

    // Try native Date parsing as fallback
    const nativeDate = new Date(dateStr);
    if (!isNaN(nativeDate.getTime())) {
      return nativeDate;
    }

    return undefined;
  }

  /**
   * Try to parse date with specific format
   */
  private tryParseDate(dateStr: string, format: string): Date | undefined {
    // Handle MM/DD/YYYY and M/D/YYYY
    if (format === 'MM/DD/YYYY' || format === 'M/D/YYYY') {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0], 10) - 1;
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Handle YYYY-MM-DD
    if (format === 'YYYY-MM-DD') {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return undefined;
  }

  /**
   * Detect broker from CSV content (heuristic-based)
   */
  detectBroker(csvContent: string): BrokerName {
    const content = csvContent.toLowerCase();

    if (content.includes('schwab')) {
      return BrokerName.SCHWAB;
    }
    if (content.includes('fidelity') || content.includes('fidelity')) {
      return BrokerName.FIDELITY;
    }
    if (content.includes('interactive') || content.includes('ibkr')) {
      return BrokerName.INTERACTIVE_BROKERS;
    }
    if (content.includes('vanguard')) {
      return BrokerName.VANGUARD;
    }
    if (content.includes('etrade')) {
      return BrokerName.ETORO; // Map etrade to etoro for now
    }
    if (content.includes('tradestation')) {
      return BrokerName.TRADESTATION;
    }

    return BrokerName.OTHER;
  }
}
