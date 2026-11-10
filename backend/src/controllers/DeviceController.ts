import type { NextFunction, Request, Response } from 'express';
import type { RegisterDevice } from '../services/RegisterDevice';
import { parseBody, registerDeviceSchema } from '../validation/schemas';



export class DeviceController {
  constructor(private readonly registerDevice: RegisterDevice) {}

  public register = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseBody(registerDeviceSchema, request.body);
      const result = await this.registerDevice.execute(body);
      response.status(result.created ? 201 : 200).json({ data: result.response });
    } catch (error) {
      next(error);
    }
  };
}