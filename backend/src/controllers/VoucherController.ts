import type { NextFunction, Request, Response } from 'express';
import type { VoucherView } from '@tpay/shared/contracts/api';
import { ApiError } from '../services/ApiError';
import type { Device, IVoucherRepository, Voucher } from '../services/ports';
import type { SubmitVoucher } from '../services/SubmitVoucher';
import { listVouchersQuerySchema, parseBody, submitVoucherSchema } from '../validation/schemas';




function toVoucherView(voucher: Voucher, deviceId: string): VoucherView {
  const isPayer = voucher.payerDeviceId === deviceId;
  return {
    voucherId: voucher.id,
    vaultId: voucher.vaultId,
    sequence: voucher.sequence,
    view: isPayer ? 'PAYER' : 'PAYEE',
    status: voucher.status,
    amountNgnMinor: voucher.amountNgnMinor,
    amountUsdMinor: voucher.amountUsdMinor,
    counterpartyName: isPayer ? voucher.payeeName : voucher.payerName,
    paypalCaptureId: voucher.paypalCaptureId,
    updatedAt: voucher.updatedAt.toISOString(),
    requestNonce: voucher.payload.requestNonce,
  };
}


export class VoucherController {
  constructor(
    private readonly submitVoucher: SubmitVoucher,
    private readonly vouchers: IVoucherRepository,
  ) {}

  public submit = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseBody(submitVoucherSchema, request.body);
      const { response: data, terminal } = await this.submitVoucher.execute(response.locals.device as Device, body);
      response.status(terminal ? 200 : 202).json({ data });
    } catch (error) {
      next(error);
    }
  };


  public list = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { limit, since } = parseBody(listVouchersQuerySchema, request.query);
      const { id } = response.locals.device as Device;
      const page = await this.vouchers.listForDevice(id, since ?? null, limit);
      const data = {
        items: page.items.map((voucher) => toVoucherView(voucher, id)),
        nextCursor: page.nextCursor,
      };
      response.json({ data });
    } catch (error) {
      next(error);
    }
  };


  public get = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { id } = response.locals.device as Device;
      const voucher = await this.vouchers.findById(String(request.params.id));
      if (voucher?.payerDeviceId !== id && voucher?.payeeDeviceId !== id) {
        throw new ApiError('VOUCHER_NOT_FOUND', 'This voucher does not exist');
      }
      response.json({ data: toVoucherView(voucher, id) });
    } catch (error) {
      next(error);
    }
  };
}
