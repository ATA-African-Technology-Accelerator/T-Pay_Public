import type { NextFunction, Request, Response } from 'express';
import type { Deposits } from '../services/Deposits';
import type { GetActiveWallet } from '../services/GetActiveWallet';
import type { PayLinks } from '../services/PayLinks';
import type { Device } from '../services/ports';
import type { WithdrawToPayPal } from '../services/WithdrawToPayPal';
import { createDepositSchema, parseBody, withdrawSchema } from '../validation/schemas';




export class WalletController {
  constructor(
    private readonly activeWallet: GetActiveWallet,
    private readonly withdrawToPayPal: WithdrawToPayPal,
    private readonly deposits: Deposits,
    private readonly payLinks: PayLinks,
  ) {}

  public get = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await this.activeWallet.execute(response.locals.device as Device);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  };


  public payLink = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ data: await this.payLinks.getOrCreate(response.locals.device as Device) });
    } catch (error) {
      next(error);
    }
  };


  public createDeposit = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseBody(createDepositSchema, request.body);
      const data = await this.deposits.create(response.locals.device as Device, body);
      response.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  };


  public completeDeposit = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await this.deposits.complete(response.locals.device as Device, String(request.params.id));
      response.status(data.status === 'COMPLETED' ? 200 : 202).json({ data });
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
