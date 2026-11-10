import type { NextFunction, Request, Response } from 'express';
import type { ProfileView } from '@tpay/shared/contracts/api';
import type { Device, IDeviceRepository } from '../services/ports';
import { parseBody, updateProfileSchema } from '../validation/schemas';





function toProfileView(device: Device): ProfileView {
  return {
    deviceId: device.id,
    displayName: device.displayName,
    language: device.language,
    payoutEmail: device.payoutEmail,
    assuranceTier: 'B',
    createdAt: device.createdAt.toISOString(),
  };
}


export class ProfileController {
  constructor(private readonly devices: IDeviceRepository) {}

  public get = (_request: Request, response: Response) => {
    const device = response.locals.device as Device;
    response.json({ data: toProfileView(device) });
  };

  public update = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const changes = parseBody(updateProfileSchema, request.body);
      const device = { ...(response.locals.device as Device), ...changes };
      await this.devices.save(device);
      response.json({ data: toProfileView(device) });
    } catch (error) {
      next(error);
    }
  };
}