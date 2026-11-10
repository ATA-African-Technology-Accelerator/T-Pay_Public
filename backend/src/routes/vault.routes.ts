import { Router, type RequestHandler } from 'express';
import type { PayPalReturnController } from '../controllers/PayPalReturnController';
import type { VaultController } from '../controllers/VaultController';

export function createVaultRouter(
  vaults: VaultController,
  paypalReturn: PayPalReturnController,
  authenticate: RequestHandler,
  idempotent: RequestHandler,
): Router {
  const router = Router();

  router.get('/paypal/return', paypalReturn.handle);
  router.post('/vaults', authenticate, idempotent, vaults.create);
  router.get('/vaults/current', authenticate, vaults.current);
  router.post('/vaults/:id/authorize', authenticate, idempotent, vaults.authorize);
  router.post('/vaults/:id/melt', authenticate, idempotent, vaults.melt);

  return router;
}
