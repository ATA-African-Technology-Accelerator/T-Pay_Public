import type { NextFunction, Request, Response } from 'express';
import type { ISigner } from '@tpay/shared/application/ports/crypto';
import { ApiError } from '../services/ApiError';
import type { Device, IIdempotencyStore } from '../services/ports';

const KEY_PATTERN = /^[\w-]{1,128}$/;
const SUCCESS_LIMIT = 300;

export function idempotent(store: IIdempotencyStore, signer: ISigner) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const key = request.header('Idempotency-Key') ?? '';
      if (!KEY_PATTERN.test(key)) {
        throw new ApiError('VALIDATION_FAILED', 'An Idempotency-Key header is required');
      }

      const device = response.locals.device as Device;
      const requestHash = await signer.hash(
        `${request.method} ${request.originalUrl} ${JSON.stringify(request.body)}`,
      );
      const claim = await store.claim(device.id, key, requestHash);

      if (claim.outcome === 'CONFLICT') {
        throw new ApiError('IDEMPOTENCY_CONFLICT', 'This Idempotency-Key is in use for another request');
      }
      if (claim.outcome === 'REPLAY') {
        response.status(claim.response.status).json(claim.response.body);
        return;
      }

      const send = response.json.bind(response);
      response.json = (body: unknown) => {
        const { statusCode: status } = response;
        const recorded = status < SUCCESS_LIMIT
          ? store.complete(device.id, key, { status, body })
          : store.release(device.id, key);
        recorded.then(() => send(body), next);
        return response;
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
