import { Router, type RequestHandler } from 'express';
import type { WalletController } from '../controllers/WalletController';




export function createWalletRouter(
  wallet: WalletController,
  authenticate: RequestHandler,
  idempotent: RequestHandler,
): Router {
  const router = Router();

  router.get('/wallet', authenticate, wallet.get);
  router.get('/wallet/pay-link', authenticate, wallet.payLink);
  router.post('/wallet/withdrawals', authenticate, idempotent, wallet.withdraw);
  router.post('/wallet/deposits', authenticate, idempotent, wallet.createDeposit);
  router.post('/wallet/deposits/:id/complete', authenticate, idempotent, wallet.completeDeposit);

  return router;
}
