import type { NextFunction, Request, Response } from 'express';
import type { GetActiveWallet } from '../services/GetActiveWallet';
import type { Device } from '../services/ports';
import type { WithdrawToPayPal } from '../services/WithdrawToPayPal';
import { parseBody, withdrawSchema } from '../validation/schemas';




export class WalletController {
  constructor(
    private readonly activeWallet: GetActiveWallet,
    private readonly withdrawToPayPal: WithdrawToPayPal,
  ) {}

  public get = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await this.activeWallet.execute(response.locals.device as Device);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  };


  public withdraw = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseBody(withdrawSchema, request.body);
      const data = await this.withdrawToPayPal.execute(response.locals.device as Device, body);
      response.status(202).json({ data });
    } catch (error) {
      next(error);
    }
  };
}
