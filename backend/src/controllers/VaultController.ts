import type { NextFunction, Request, Response } from 'express';
import type { AuthorizeVault } from '../services/AuthorizeVault';
import type { CreateVaultOrder } from '../services/CreateVaultOrder';
import type { GetCurrentVault } from '../services/GetCurrentVault';
import type { LockFromWallet } from '../services/LockFromWallet';
import type { MeltVault } from '../services/MeltVault';
import type { Device } from '../services/ports';
import { createVaultSchema, meltVaultSchema, parseBody } from '../validation/schemas';

export class VaultController {
  constructor(
    private readonly createOrder: CreateVaultOrder,
    private readonly authorizeVault: AuthorizeVault,
    private readonly currentVault: GetCurrentVault,
    private readonly meltVault: MeltVault,
    private readonly lockFromWallet: LockFromWallet,
  ) {}

  public fromWallet = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseBody(createVaultSchema, request.body);
      const data = await this.lockFromWallet.execute(response.locals.device as Device, body);
      response.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  };

  public create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseBody(createVaultSchema, request.body);
      const data = await this.createOrder.execute(response.locals.device as Device, body);
      response.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  };

  public authorize = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const vaultId = String(request.params.id);
      const data = await this.authorizeVault.execute(response.locals.device as Device, vaultId);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  };

  public melt = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseBody(meltVaultSchema, request.body);
      const vaultId = String(request.params.id);
      const data = await this.meltVault.execute(response.locals.device as Device, vaultId, body);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  };

  public current = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await this.currentVault.execute(response.locals.device as Device);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  };
}
