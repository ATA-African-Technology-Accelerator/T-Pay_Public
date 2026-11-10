import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../services/ApiError';
import type { ApplyPayPalEvent } from '../services/ApplyPayPalEvent';
import type { IPaymentGateway } from '../services/ports';
import { parseBody, paypalWebhookSchema } from '../validation/schemas';




export type RequestWithRawBody = Request & { rawBody?: Buffer };


export class PayPalWebhookController {
  constructor(
    private readonly gateway: IPaymentGateway,
    private readonly applyEvent: ApplyPayPalEvent,
  ) {}

  public handle = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const rawBody = (request as RequestWithRawBody).rawBody?.toString('utf8') ?? '';
      if (!(await this.gateway.verifyWebhook({ headers: request.headers, rawBody }))) {
        throw new ApiError('INVALID_SIGNATURE', 'The webhook signature is not valid');
      }
      await this.applyEvent.execute(parseBody(paypalWebhookSchema, request.body));
      response.json({ data: { received: true } });
    } catch (error) {
      next(error);
    }
  };
}
