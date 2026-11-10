import { Router } from 'express';

export interface HealthDependencies {
  checkDatabase(): Promise<boolean>;
  checkPayPal(): Promise<boolean>;
  mode: 'sandbox' | 'live';
}

export function createHealthRouter({ checkDatabase, checkPayPal, mode }: HealthDependencies): Router {
  const router = Router();

  router.get('/health', async (_request, response) => {
    const [databaseIsUp, paypalIsUp] = await Promise.all([checkDatabase(), checkPayPal()]);
    const healthy = databaseIsUp && paypalIsUp;
    response.status(healthy ? 200 : 503).json({
      data: {
        status: healthy ? 'ok' : 'degraded',
        database: databaseIsUp ? 'ok' : 'down',
        paypal: paypalIsUp ? 'ok' : 'down',
        mode,
      },
    });
  });

  return router;
}
