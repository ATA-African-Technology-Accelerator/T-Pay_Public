import { Router, type RequestHandler } from 'express';
import type { TransactionController } from '../controllers/TransactionController';




export function createTransactionRouter(
  transactions: TransactionController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.get('/transactions', authenticate, transactions.list);

  return router;
}