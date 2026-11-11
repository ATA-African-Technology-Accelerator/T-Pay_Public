import type { NextFunction, Request, Response } from 'express';
import type { Deposits } from '../services/Deposits';
import type { IVaultRepository } from '../services/ports';
import { parseBody, paypalReturnQuerySchema } from '../validation/schemas';

export class PayPalReturnController {
  constructor(private readonly vaults: IVaultRepository, private readonly deposits: Deposits) {}

  public handle = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { depositId, outcome, token, vaultId } = parseBody(paypalReturnQuerySchema, request.query);
      if (depositId !== undefined) {
        if (outcome === 'cancelled') {
          await this.deposits.cancel(depositId, token);
        }
        response.redirect(302, `tpay://wallet/return?${new URLSearchParams({ depositId, outcome })}`);
        return;
      }
      if (vaultId === undefined) {
        return;
      }
      if (outcome === 'cancelled') {
        const vault = await this.vaults.findById(vaultId);
        if (vault && vault.paypalOrderId === token) {
          await this.vaults.abandon(vault.id);
        }
      }
      response.redirect(302, `tpay://vault/return?${new URLSearchParams({ vaultId, outcome })}`);
    } catch (error) {
      next(error);
    }
  };
}
