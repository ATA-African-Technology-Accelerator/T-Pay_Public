import express, { type Express } from 'express';
import { createServices } from './composition/createServices';
import { DeviceController } from './controllers/DeviceController';
import { PayPalReturnController } from './controllers/PayPalReturnController';
import { PayPalWebhookController, type RequestWithRawBody } from './controllers/PayPalWebhookController';
import { ProfileController } from './controllers/ProfileController';
import { TransactionController } from './controllers/TransactionController';
import { VaultController } from './controllers/VaultController';
import { VoucherController } from './controllers/VoucherController';
import { WalletController } from './controllers/WalletController';
import { authenticate } from './middleware/authenticate';
import { errorHandler, notFound } from './middleware/errorHandler';
import { idempotent } from './middleware/idempotent';
import { createDeviceRouter } from './routes/device.routes';
import { createHealthRouter } from './routes/health.routes';
import { createTransactionRouter } from './routes/transaction.routes';
import { createVaultRouter } from './routes/vault.routes';
import { createVoucherRouter } from './routes/voucher.routes';
import { createWalletRouter } from './routes/wallet.routes';
import { AuthorizeVault } from './services/AuthorizeVault';
import { CreateVaultOrder } from './services/CreateVaultOrder';
import { GetActiveWallet } from './services/GetActiveWallet';
import { GetCurrentVault } from './services/GetCurrentVault';
import type {
  IIdempotencyStore, IPaymentGateway, ITransactionRepository, IVaultRepository, IVoucherRepository,
  IWalletRepository,
} from './services/ports';
import { RegisterDevice, type RegisterDeviceDependencies } from './services/RegisterDevice';






export interface AppDependencies extends RegisterDeviceDependencies {
  transactions: ITransactionRepository;
  vaults: IVaultRepository;
  vouchers: IVoucherRepository;
  wallet: IWalletRepository;
  idempotency: IIdempotencyStore;
  gateway: IPaymentGateway;
  checkDatabase(): Promise<boolean>;
  paypalMode: 'sandbox' | 'live';
  fxRate: string;
  publicBaseUrl: string;
  rootPublicKey: string;
}


export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  const {
    checkDatabase, devices, gateway, idempotency, paypalMode, signer, transactions, vaults, vouchers,
  } = dependencies;
  const services = createServices(dependencies);
  const requireDevice = authenticate(devices, signer);

  app.use(express.json({
    verify: (request, _response, buffer) => {
      (request as RequestWithRawBody).rawBody = buffer;
    },
  }));
  app.use('/api', createHealthRouter({
    checkDatabase,
    checkPayPal: () => gateway.isReachable(),
    mode: paypalMode,
  }));
  app.use(
    '/api',
    createDeviceRouter(
      new DeviceController(new RegisterDevice(dependencies)),
      new ProfileController(devices),
      requireDevice,
    ),
  );
  app.use('/api', createTransactionRouter(new TransactionController(transactions), requireDevice));
  app.use(
    '/api',
    createVaultRouter(
      new VaultController(
        new CreateVaultOrder(dependencies),
        new AuthorizeVault(dependencies),
        new GetCurrentVault(vaults, vouchers),
        services.meltVault,
      ),
      new PayPalReturnController(vaults),
      requireDevice,
      idempotent(idempotency, signer),
    ),
  );
  app.use('/api', createVoucherRouter(new VoucherController(services.submitVoucher, vouchers), requireDevice));
  app.use(
    '/api',
    createWalletRouter(
      new WalletController(new GetActiveWallet(vouchers), services.withdrawToPayPal),
      requireDevice,
      idempotent(idempotency, signer),
    ),
  );
  app.post('/api/webhooks/paypal', new PayPalWebhookController(gateway, services.applyPayPalEvent).handle);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}