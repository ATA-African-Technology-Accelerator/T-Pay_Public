import type {
  AuthorizeVaultResponse, CreateVaultRequest, CreateVaultResponse,
  CurrentVaultResponse, InterpretRequest, InterpretResponse,
  ListTransactionsResponse, ListVouchersResponse, MeltVaultRequest,
  MeltVaultResponse, ActiveWalletResponse, ProfileView,
  RegisterDeviceRequest, RegisterDeviceResponse, SubmitVoucherRequest,
  SubmitVoucherResponse, UpdateProfileRequest, VoucherView,
  WithdrawRequest, WithdrawResponse,
} from '../../contracts/api';





export interface ITPayApi {
  registerDevice(request: RegisterDeviceRequest): Promise<RegisterDeviceResponse>;
  getProfile(): Promise<ProfileView>;
  updateProfile(request: UpdateProfileRequest): Promise<ProfileView>;
  createVault(request: CreateVaultRequest): Promise<CreateVaultResponse>;
  authorizeVault(vaultId: string): Promise<AuthorizeVaultResponse>;
  getCurrentVault(): Promise<CurrentVaultResponse>;
  meltVault(vaultId: string, request: MeltVaultRequest): Promise<MeltVaultResponse>;
  submitVoucher(request: SubmitVoucherRequest): Promise<SubmitVoucherResponse>;
  listVouchers(since?: string): Promise<ListVouchersResponse>;
  getVoucher(voucherId: string): Promise<VoucherView>;
  listTransactions(since?: string): Promise<ListTransactionsResponse>;
  getActiveWallet(): Promise<ActiveWalletResponse>;
  withdraw(request: WithdrawRequest): Promise<WithdrawResponse>;
  interpret(request: InterpretRequest): Promise<InterpretResponse>;
}