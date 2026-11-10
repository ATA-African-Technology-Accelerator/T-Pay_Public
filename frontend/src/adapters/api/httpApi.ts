import { randomUUID } from 'expo-crypto';
import type { ITPayApi, MutationOptions } from '@tpay/shared/application/ports/api';
import type {
  ActiveWalletResponse, AuthorizeVaultResponse, CreateVaultRequest, CreateVaultResponse,
  CurrentVaultResponse, InterpretRequest, InterpretResponse, ListTransactionsResponse,
  ListVouchersResponse, MeltVaultRequest, MeltVaultResponse, ProfileView, RegisterDeviceRequest,
  RegisterDeviceResponse, SubmitVoucherRequest, SubmitVoucherResponse, UpdateProfileRequest,
  VoucherView, WithdrawRequest, WithdrawResponse,
} from '@tpay/shared/contracts/api';
import type { ApiErrorBody, ErrorCode } from '@tpay/shared/contracts/errors';

const TIMEOUT_MS = 20_000;
const ASSISTANT_TIMEOUT_MS = 40_000;

/** A refusal from the backend, or `NETWORK` when it couldn't be reached. Screens switch on `code`. */
export class ApiRequestError extends Error {
  constructor(public readonly code: ErrorCode | 'NETWORK', message: string, public readonly status = 0) {
    super(message);
  }
}

// `idempotent` takes the caller's key, kept across retries of one action, or makes one
// for a single attempt.
type Options = { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; auth?: boolean; idempotent?: MutationOptions | true; timeoutMs?: number };

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
  createVault(request: CreateVaultRequest, options: MutationOptions = {}) {
    return this.call<CreateVaultResponse>('/vaults', { method: 'POST', body: request, idempotent: options });
  }
  authorizeVault(vaultId: string, options: MutationOptions = {}) {
    return this.call<AuthorizeVaultResponse>(`/vaults/${encodeURIComponent(vaultId)}/authorize`, { method: 'POST', body: {}, idempotent: options });
  }
  getCurrentVault() { return this.call<CurrentVaultResponse>('/vaults/current'); }
  meltVault(vaultId: string, request: MeltVaultRequest, options: MutationOptions = {}) {
    return this.call<MeltVaultResponse>(`/vaults/${encodeURIComponent(vaultId)}/melt`, { method: 'POST', body: request, idempotent: options });
  }
  submitVoucher(request: SubmitVoucherRequest) { return this.call<SubmitVoucherResponse>('/vouchers', { method: 'POST', body: request }); }
  listVouchers(since?: string) { return this.call<ListVouchersResponse>(`/vouchers${query({ since })}`); }
  getVoucher(voucherId: string) { return this.call<VoucherView>(`/vouchers/${encodeURIComponent(voucherId)}`); }
  listTransactions(since?: string) { return this.call<ListTransactionsResponse>(`/transactions${query({ since })}`); }
  getActiveWallet() { return this.call<ActiveWalletResponse>('/wallet'); }
  withdraw(request: WithdrawRequest, options: MutationOptions = {}) {
    return this.call<WithdrawResponse>('/wallet/withdrawals', { method: 'POST', body: request, idempotent: options });
  }
  // Changes nothing, so no Idempotency-Key. Speech can take Gemini a while.
  interpret(request: InterpretRequest) {
    return this.call<InterpretResponse>('/assistant/interpret', { method: 'POST', body: request, timeoutMs: ASSISTANT_TIMEOUT_MS });
  }

  private async call<T>(path: string, { method = 'GET', body, auth = true, idempotent, timeoutMs = TIMEOUT_MS }: Options = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = await this.token();
      if (!token) throw new ApiRequestError('UNAUTHENTICATED', 'This phone is not registered yet', 401);
      headers.Authorization = `Bearer ${token}`;
    }
    if (idempotent) headers['Idempotency-Key'] = (idempotent !== true && idempotent.idempotencyKey) || randomUUID();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
