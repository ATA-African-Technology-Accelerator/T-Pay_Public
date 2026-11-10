import { OfflineEscrowToken } from '../../domain/OfflineEscrowToken';

export interface PayPalCaptureResponse {
  success: boolean;
  orderId: string;
  captureId: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  errorMessage?: string;
}

export interface IPayPalGateway {
  captureEscrowToken(token: OfflineEscrowToken): Promise<PayPalCaptureResponse>;
  isNetworkAvailable(): Promise<boolean>;
}
