export type SupportedLanguage = 'en' | 'pidgin' | 'yoruba' | 'igbo' | 'hausa';

export type ExecutionMode = 'offline_slm' | 'online_cloud';

export type IntentType =
  | 'COLLECT_MERCHANT_PAYMENT'
  | 'BULK_SETUP_INVENTORY'
  | 'DEDUCT_BUDGET_EXPENSE'
  | 'COLLECT_TRANSIT_FARES'
  | 'DAILY_RECONCILIATION'
  | 'PEER_TRANSFER'
  | 'UNKNOWN';

export interface VoiceIntent {
  type: IntentType;
  confidence: number;
  parameters: {
    amount?: number;
    itemName?: string;
    description?: string;
    recipientName?: string;
    rawTranscript?: string;
    [key: string]: any;
  };
}

