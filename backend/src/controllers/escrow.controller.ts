import type { Request, Response } from 'express';
import { container } from '@tpay/shared/container';

export class EscrowController {
  public static async createEscrow(req: Request, res: Response): Promise<void> {
    try {
      const { senderDeviceId, senderName, senderAccount, recipientDeviceId, recipientName, recipientAccount, amount, currency } = req.body;
      const result = await container.createOfflineEscrowUseCase.execute({
        senderDeviceId,
        senderName,
        senderAccount,
        recipientDeviceId,
        recipientName,
        recipientAccount,
        amount: Number(amount),
        currency: currency || 'NGN',
      });

      if (result.isSuccess) {
        res.status(201).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async syncEscrow(req: Request, res: Response): Promise<void> {
    try {
      const reportingDeviceId = req.body.reportingDeviceId || 'BACKEND-SERVER-01';
      const result = await container.syncEscrowsToPayPalUseCase.execute(reportingDeviceId);

      if (result.isSuccess) {
        res.status(200).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async getTokens(req: Request, res: Response): Promise<void> {
    try {
      const tokens = await container.escrowRepository.findAll();
      const serialized = tokens.map((t) => ({
        id: t.id.toValue(),
        sender: t.sender.name,
        senderAccount: t.sender.accountNumber,
        recipient: t.recipient.name,
        recipientAccount: t.recipient.accountNumber,
        amount: t.amount.format(),
        status: t.status,
        cryptogram: t.cryptogram.hash,
        isSettled: t.isSettled,
        paypalOrderId: t.paypalOrderId,
      }));
      res.status(200).json({ success: true, count: serialized.length, data: serialized });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}

