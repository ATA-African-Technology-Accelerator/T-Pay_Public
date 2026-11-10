import type {
  AuthorizeVaultResponse, CreateVaultRequest, CreateVaultResponse,
  CurrentVaultResponse, InterpretRequest, InterpretResponse,
  ListTransactionsResponse, ListVouchersResponse, MeltVaultRequest,
  MeltVaultResponse, ActiveWalletResponse, ProfileView,
  RegisterDeviceRequest, RegisterDeviceResponse, SubmitVoucherRequest,
  SubmitVoucherResponse, UpdateProfileRequest, VoucherView,
  WithdrawRequest, WithdrawResponse,
} from '../../contracts/api';





// A retry must send the same Idempotency-Key as the first try, or the backend
// treats it as a new request. Callers keep the key until the action succeeds.
export interface MutationOptions {
  idempotencyKey?: string;
}


export interface ITPayApi {
  registerDevice(request: RegisterDeviceRequest): Promise<RegisterDeviceResponse>;
  getProfile(): Promise<ProfileView>;
  updateProfile(request: UpdateProfileRequest): Promise<ProfileView>;
  createVault(request: CreateVaultRequest, options?: MutationOptions): Promise<CreateVaultResponse>;
  authorizeVault(vaultId: string, options?: MutationOptions): Promise<AuthorizeVaultResponse>;
  getCurrentVault(): Promise<CurrentVaultResponse>;
  meltVault(vaultId: string, request: MeltVaultRequest, options?: MutationOptions): Promise<MeltVaultResponse>;
  submitVoucher(request: SubmitVoucherRequest): Promise<SubmitVoucherResponse>;
  listVouchers(since?: string): Promise<ListVouchersResponse>;
  getVoucher(voucherId: string): Promise<VoucherView>;
  listTransactions(since?: string): Promise<ListTransactionsResponse>;
  getActiveWallet(): Promise<ActiveWalletResponse>;
  withdraw(request: WithdrawRequest, options?: MutationOptions): Promise<WithdrawResponse>;
  interpret(request: InterpretRequest): Promise<InterpretResponse>;
}