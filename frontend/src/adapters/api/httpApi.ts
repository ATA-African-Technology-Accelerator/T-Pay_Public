import { randomUUID } from 'expo-crypto';
import type { ITPayApi } from '@tpay/shared/application/ports/api';
import type {
  ActiveWalletResponse, AuthorizeVaultResponse, CreateVaultRequest, CreateVaultResponse,
  CurrentVaultResponse, InterpretRequest, InterpretResponse, ListTransactionsResponse,
  ListVouchersResponse, MeltVaultRequest, MeltVaultResponse, ProfileView, RegisterDeviceRequest,
  RegisterDeviceResponse, SubmitVoucherRequest, SubmitVoucherResponse, UpdateProfileRequest,
  VoucherView, WithdrawRequest, WithdrawResponse,
} from '@tpay/shared/contracts/api';
import type { ApiErrorBody, ErrorCode } from '@tpay/shared/contracts/errors';

const TIMEOUT_MS = 20_000;

/** A refusal from the backend, or `NETWORK` when it couldn't be reached. Screens switch on `code`. */
export class ApiRequestError extends Error {
  constructor(public readonly code: ErrorCode | 'NETWORK', message: string, public readonly status = 0) {
    super(message);
  }
}

type Options = { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; auth?: boolean; idempotent?: boolean };

/**
 * Talks to the T-Pay backend. Every response is `{ data }`; errors are `{ error: { code } }`.
 * Raw server text is never shown to people; the code is.
 */
export class HttpTPayApi implements ITPayApi {
  constructor(private readonly baseUrl: string, private readonly token: () => Promise<string | null>) {}

  registerDevice(request: RegisterDeviceRequest) {
    return this.call<RegisterDeviceResponse>('/devices/register', { method: 'POST', body: request, auth: false });
  }
  getProfile() { return this.call<ProfileView>('/profile'); }
  updateProfile(request: UpdateProfileRequest) { return this.call<ProfileView>('/profile', { method: 'PATCH', body: request }); }
  createVault(request: CreateVaultRequest) {
    return this.call<CreateVaultResponse>('/vaults', { method: 'POST', body: request, idempotent: true });
  }
  authorizeVault(vaultId: string) {
    return this.call<AuthorizeVaultResponse>(`/vaults/${encodeURIComponent(vaultId)}/authorize`, { method: 'POST', body: {}, idempotent: true });
  }
  getCurrentVault() { return this.call<CurrentVaultResponse>('/vaults/current'); }
  meltVault(vaultId: string, request: MeltVaultRequest) {
    return this.call<MeltVaultResponse>(`/vaults/${encodeURIComponent(vaultId)}/melt`, { method: 'POST', body: request, idempotent: true });
  }
  submitVoucher(request: SubmitVoucherRequest) { return this.call<SubmitVoucherResponse>('/vouchers', { method: 'POST', body: request }); }
  listVouchers(since?: string) { return this.call<ListVouchersResponse>(`/vouchers${query({ since })}`); }
  getVoucher(voucherId: string) { return this.call<VoucherView>(`/vouchers/${encodeURIComponent(voucherId)}`); }
  listTransactions(since?: string) { return this.call<ListTransactionsResponse>(`/transactions${query({ since })}`); }
  getActiveWallet() { return this.call<ActiveWalletResponse>('/wallet'); }
  withdraw(request: WithdrawRequest) {
    return this.call<WithdrawResponse>('/wallet/withdrawals', { method: 'POST', body: request, idempotent: true });
  }
  // The backend has no assistant route yet. Fail by name rather than pretend.
  async interpret(_request: InterpretRequest): Promise<InterpretResponse> {
    throw new ApiRequestError('AI_UNAVAILABLE', 'The assistant endpoint is not deployed yet');
  }

  private async call<T>(path: string, { method = 'GET', body, auth = true, idempotent = false }: Options = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = await this.token();
      if (!token) throw new ApiRequestError('UNAUTHENTICATED', 'This phone is not registered yet', 401);
      headers.Authorization = `Bearer ${token}`;
    }
    if (idempotent) headers['Idempotency-Key'] = randomUUID();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      });
    } catch {
      throw new ApiRequestError('NETWORK', 'Could not reach T-Pay');
    } finally {
      clearTimeout(timer);
    }

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (json as ApiErrorBody | null)?.error;
      throw new ApiRequestError(error?.code ?? 'INTERNAL_SERVER_ERROR', error?.message ?? `HTTP ${response.status}`, response.status);
    }
    return (json as { data: T }).data;
  }
}

function query(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params).filter((p): p is [string, string] => p[1] != null);
  return pairs.length ? `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
}
