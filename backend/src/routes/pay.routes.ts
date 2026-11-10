import express, { Router, type RequestHandler } from 'express';
import type { PayPageController } from '../controllers/PayPageController';




// The public pay pages. Opening a page is cheap; every submit makes a PayPal order, so submitting is limited.
export function createPayRouter(pages: PayPageController, limitSubmits: RequestHandler): Router {
  const router = Router();

  router.get('/:token', pages.form);
  router.post('/:token', limitSubmits, express.urlencoded({ extended: false, limit: '2kb' }), pages.pay);
  router.get('/:token/return', pages.back);

  return router;
}
