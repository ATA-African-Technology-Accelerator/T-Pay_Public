import type { NextFunction, Request, Response } from 'express';
import type { ListTransactionsResponse, TransactionView } from '@tpay/shared/contracts/api';
import type { Device, ITransactionRepository, TransactionEvent } from '../services/ports';
import { listTransactionsQuerySchema, parseBody } from '../validation/schemas';





const PAGE_SIZE = 50;


function toTransactionView({ id, deviceId: _deviceId, occurredAt, ...fields }: TransactionEvent): TransactionView {
  return { transactionId: id, ...fields, occurredAt: occurredAt.toISOString() };
}


export class TransactionController {
  constructor(private readonly transactions: ITransactionRepository) {}

  public list = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { since } = parseBody(listTransactionsQuerySchema, request.query);
      const device = response.locals.device as Device;
      const page = await this.transactions.listForDevice(device.id, since ?? null, PAGE_SIZE);
      const data: ListTransactionsResponse = {
        items: page.items.map(toTransactionView),
        nextCursor: page.nextCursor,
      };
      response.json({ data });
    } catch (error) {
      next(error);
    }
  };
}