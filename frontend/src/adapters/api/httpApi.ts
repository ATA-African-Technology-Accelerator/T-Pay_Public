import { randomUUID } from 'expo-crypto';
import type { ITPayApi, MutationOptions } from '@tpay/shared/application/ports/api';
import type {
  ActiveWalletResponse, AuthorizeVaultResponse, CompleteDepositResponse, CreateDepositRequest, CreateDepositResponse,
  CreateVaultRequest, CreateVaultResponse, PayLinkResponse,
  CurrentVaultResponse, InterpretRequest, InterpretResponse, SpeakRequest, SpeakResponse, ListTransactionsResponse,
  ListVouchersResponse, MeltVaultRequest, MeltVaultResponse, ProfileView, RegisterDeviceRequest,
  RegisterDeviceResponse, SubmitVoucherRequest, SubmitVoucherResponse, UpdateProfileRequest,
  VoucherView, WithdrawRequest, WithdrawResponse,
} from '@tpay/shared/contracts/api';
import type { ApiErrorBody, ErrorCode } from '@tpay/shared/contracts/errors';

const TIMEOUT_MS = 20_000;
// The first request after the free server has slept takes up to a minute to be answered.
const WAKE_TIMEOUT_MS = 70_000;
const RETRY_DELAY_MS = 1_500;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
// Speech is only worth waiting for briefly: the phone's own voice covers a slow answer.
const SPEAK_TIMEOUT_MS = 8_000;
// Gemini answers in a few seconds. Past this, the phone's own assistant answers instead of
// leaving the person waiting.
const ASSISTANT_TIMEOUT_MS = 20_000;

/** A refusal from the backend, or `NETWORK` when it couldn't be reached. Screens switch on `code`. */
export class ApiRequestError extends Error {
  constructor(public readonly code: ErrorCode | 'NETWORK', message: string, public readonly status = 0) {
    super(message);
  }
}

// `idempotent` takes the caller's key, kept across retries of one action, or makes one
// for a single attempt.
// `retry`: send once more after a dropped connection or "PayPal unavailable". Only for calls
// that are safe to repeat: reads, registration (the same key always gives the same identity)
// and anything carrying an Idempotency-Key.
type Options = { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; auth?: boolean; idempotent?: MutationOptions | true; timeoutMs?: number; retry?: boolean };

/**
 * Talks to the T-Pay backend. Every response is `{ data }`; errors are `{ error: { code } }`.
 * Raw server text is never shown to people; the code is.
 */
export class HttpTPayApi implements ITPayApi {
  constructor(private readonly baseUrl: string, private readonly token: () => Promise<string | null>) {}

  registerDevice(request: RegisterDeviceRequest) {
    return this.call<RegisterDeviceResponse>('/devices/register', { method: 'POST', body: request, auth: false, timeoutMs: WAKE_TIMEOUT_MS, retry: true });
  }
  getProfile() { return this.call<ProfileView>('/profile'); }
  updateProfile(request: UpdateProfileRequest) { return this.call<ProfileView>('/profile', { method: 'PATCH', body: request }); }
  createVault(request: CreateVaultRequest, options: MutationOptions = {}) {
    return this.call<CreateVaultResponse>('/vaults', { method: 'POST', body: request, idempotent: options });
  }
  authorizeVault(vaultId: string, options: MutationOptions = {}) {
    return this.call<AuthorizeVaultResponse>(`/vaults/${encodeURIComponent(vaultId)}/authorize`, { method: 'POST', body: {}, idempotent: options });
  }
  lockFromWallet(request: CreateVaultRequest, options: MutationOptions = {}) {
    return this.call<AuthorizeVaultResponse>('/vaults/from-wallet', { method: 'POST', body: request, idempotent: options });
  }
  getCurrentVault() { return this.call<CurrentVaultResponse>('/vaults/current'); }
  meltVault(vaultId: string, request: MeltVaultRequest, options: MutationOptions = {}) {
    return this.call<MeltVaultResponse>(`/vaults/${encodeURIComponent(vaultId)}/melt`, { method: 'POST', body: request, idempotent: options });
  }
  // Unique on vault and sequence at the backend, so sending it twice is safe.
  submitVoucher(request: SubmitVoucherRequest) { return this.call<SubmitVoucherResponse>('/vouchers', { method: 'POST', body: request, retry: true }); }
  listVouchers(since?: string) { return this.call<ListVouchersResponse>(`/vouchers${query({ since })}`); }
  getVoucher(voucherId: string) { return this.call<VoucherView>(`/vouchers/${encodeURIComponent(voucherId)}`); }
  listTransactions(since?: string) { return this.call<ListTransactionsResponse>(`/transactions${query({ since })}`); }
  getActiveWallet() { return this.call<ActiveWalletResponse>('/wallet'); }
  getPayLink() { return this.call<PayLinkResponse>('/wallet/pay-link'); }
  createDeposit(request: CreateDepositRequest, options: MutationOptions = {}) {
    return this.call<CreateDepositResponse>('/wallet/deposits', { method: 'POST', body: request, idempotent: options });
  }
  completeDeposit(depositId: string, options: MutationOptions = {}) {
    return this.call<CompleteDepositResponse>(`/wallet/deposits/${encodeURIComponent(depositId)}/complete`, { method: 'POST', body: {}, idempotent: options });
  }
  withdraw(request: WithdrawRequest, options: MutationOptions = {}) {
    return this.call<WithdrawResponse>('/wallet/withdrawals', { method: 'POST', body: request, idempotent: options });
  }
  // Changes nothing, so no Idempotency-Key. Speech can take Gemini a while.
  interpret(request: InterpretRequest) {
    return this.call<InterpretResponse>('/assistant/interpret', { method: 'POST', body: request, timeoutMs: ASSISTANT_TIMEOUT_MS });
  }

  // A short clip of the reply read aloud. Changes nothing, so no Idempotency-Key.
  speak(request: SpeakRequest) {
    return this.call<SpeakResponse>('/assistant/speak', { method: 'POST', body: request, timeoutMs: SPEAK_TIMEOUT_MS });
  }

  /** Wakes a sleeping server, and PayPal's login behind it, while the person is still typing. */
  async warmUp(): Promise<void> {
    try { await fetch(`${this.baseUrl}/api/health`, { method: 'GET' }); } catch { /* nothing to do: the real call will try again */ }
  }

  private async call<T>(path: string, options: Options = {}): Promise<T> {
    const { method = 'GET', idempotent, retry = method === 'GET' || !!idempotent } = options;
    // One key for every attempt, so a repeated request can never be applied twice.
    const key = idempotent ? (idempotent !== true && idempotent.idempotencyKey) || randomUUID() : null;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.attempt<T>(path, options, key);
      } catch (e) {
        const again = retry && attempt < 2 && e instanceof ApiRequestError && (e.code === 'NETWORK' || e.code === 'PAYPAL_UNAVAILABLE');
        if (!again) throw e;
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  private async attempt<T>(path: string, { method = 'GET', body, auth = true, timeoutMs = TIMEOUT_MS }: Options, key: string | null): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = await this.token();
      if (!token) throw new ApiRequestError('UNAUTHENTICATED', 'This phone is not registered yet', 401);
      headers.Authorization = `Bearer ${token}`;
    }
    if (key) headers['Idempotency-Key'] = key;

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
