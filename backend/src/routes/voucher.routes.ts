import { Router, type RequestHandler } from 'express';
import type { VoucherController } from '../controllers/VoucherController';




export function createVoucherRouter(vouchers: VoucherController, authenticate: RequestHandler): Router {
  const router = Router();

  router.post('/vouchers', authenticate, vouchers.submit);
  router.get('/vouchers', authenticate, vouchers.list);
  router.get('/vouchers/:id', authenticate, vouchers.get);

  return router;
}
