import type { NextFunction, Request, Response } from 'express';
import type { IVaultRepository } from '../services/ports';
import { parseBody, paypalReturnQuerySchema } from '../validation/schemas';

export class PayPalReturnController {
  constructor(private readonly vaults: IVaultRepository) {}

  public handle = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { outcome, token, vaultId } = parseBody(paypalReturnQuerySchema, request.query);
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
