export interface InitiateEscrowInputDTO {
  senderDeviceId: string;
  senderName: string;
  senderAccount: string;
  recipientDeviceId: string;
  recipientName: string;
  recipientAccount: string;
  amount: number;
  currency?: 'NGN' | 'USD';
}

export interface EscrowTokenResponseDTO {
  id: string;
  senderName: string;
  senderAccount: string;
  recipientName: string;
  recipientAccount: string;
  amountFormatted: string;
  amountNumeric: number;
  currency: string;
  cryptogramHash: string;
  status: string;
  createdOfflineAt: string;
  syncedToPayPal: boolean;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  syncedByDeviceId?: string;
}

export interface SyncResultDTO {
  totalAttempted: number;
  totalSynced: number;
  settledTokens: EscrowTokenResponseDTO[];
  message: string;
}

