import type { NextFunction, Request, Response } from 'express';
import type { InterpretRequest } from '../services/InterpretRequest';
import type { Device } from '../services/ports';
import { interpretSchema, parseBody } from '../validation/schemas';




export class AssistantController {
  constructor(private readonly interpretRequest: InterpretRequest) {}

  public interpret = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseBody(interpretSchema, request.body);
      const data = await this.interpretRequest.execute(response.locals.device as Device, body);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  };
}
