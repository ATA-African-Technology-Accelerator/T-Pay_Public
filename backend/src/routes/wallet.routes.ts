import { Router, type RequestHandler } from 'express';
import type { WalletController } from '../controllers/WalletController';




export function createWalletRouter(
  wallet: WalletController,
  authenticate: RequestHandler,
  idempotent: RequestHandler,
): Router {
  const router = Router();

  router.get('/wallet', authenticate, wallet.get);
  router.post('/wallet/withdrawals', authenticate, idempotent, wallet.withdraw);

  return router;
}
