export interface ProcessVoiceSaleInputDTO {
  spokenQuery: string;
  matchedItemName: string;
  currencyAmount: number;
  paymentMethod?: 'bluetooth_escrow' | 'cash' | 'paypal' | 'qr_code';
}

export interface VoiceSaleResultDTO {
  saleId: string;
  itemName: string;
  unitsSold: number;
  unitType: string;
  totalAmountFormatted: string;
  remainingStock: number;
  spokenConfirmation: string;
  isLowStock: boolean;
}

export interface BulkImportInputDTO {
  spokenTranscript: string;
}

export interface BulkImportResultDTO {
  itemsCount: number;
  importedItems: {
    id: string;
    name: string;
    quantity: number;
    unitType: string;
    unitPriceFormatted: string;
    category: string;
  }[];
  spreadsheetSummaryText: string;
}

export interface DailyReconciliationDTO {
  date: string;
  totalSalesCount: number;
  totalRevenueFormatted: string;
  breakdownByPaymentMethod: {
    method: string;
    count: number;
    amountFormatted: string;
  }[];
  lowStockItems: {
    name: string;
    currentStock: number;
    unitType: string;
  }[];
  readoutScript: string;
}

