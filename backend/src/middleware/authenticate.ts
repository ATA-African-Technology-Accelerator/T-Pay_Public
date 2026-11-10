import type { NextFunction, Request, Response } from 'express';
import type { ISigner } from '@tpay/shared/application/ports/crypto';
import { ApiError } from '../services/ApiError';
import type { IDeviceRepository } from '../services/ports';




const BEARER_PREFIX = 'Bearer ';


export function authenticate(devices: IDeviceRepository, signer: ISigner) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const header = request.headers.authorization ?? '';
      if (!header.startsWith(BEARER_PREFIX)) {
        throw new ApiError('UNAUTHENTICATED', 'A device token is required');
      }
      const tokenHash = await signer.hash(header.slice(BEARER_PREFIX.length));
      const device = await devices.findByTokenHash(tokenHash);
      if (!device) {
        throw new ApiError('UNAUTHENTICATED', 'The device token is not valid');
      }
      if (device.revokedAt) {
        throw new ApiError('DEVICE_REVOKED', 'This device has been revoked');
      }
      response.locals.device = device;
      next();
    } catch (error) {
      next(error);
    }
  };
}