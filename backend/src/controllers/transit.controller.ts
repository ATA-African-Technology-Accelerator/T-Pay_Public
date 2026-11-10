import type { Request, Response } from 'express';
import { container } from '@tpay/shared/container';

export class TransitController {
  public static async getActiveTrip(req: Request, res: Response): Promise<void> {
    try {
      const trip = await container.transitRepository.getActiveTrip();
      res.status(200).json({
        success: true,
        data: {
          id: trip.id.toValue(),
          driverName: trip.driverName,
          vehicleType: trip.vehicleType,
          routeName: trip.routeName,
          fareFormatted: trip.farePerSeat.format(),
          totalSeats: trip.totalSeats,
          paidSeatsCount: trip.paidSeatsCount,
          unpaidSeatsCount: trip.unpaidSeatsCount,
          isFullyPaid: trip.isFullyPaid,
          seats: trip.seats.map((s) => ({
            seatNumber: s.seatNumber,
            isPaid: s.isPaid,
            passengerName: s.passengerName,
            passengerDeviceId: s.passengerDeviceId,
            paymentMethod: s.paymentMethod,
            paidAt: s.paidAt?.toISOString(),
          })),
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  public static async collectFares(req: Request, res: Response): Promise<void> {
    try {
      const result = await container.collectPassengerFaresUseCase.execute();
      if (result.isSuccess) {
        res.status(200).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}

export class AssistantController {
  public static async processCommand(req: Request, res: Response): Promise<void> {
    try {
      const { transcript, language, executionMode } = req.body;
      const result = await container.processSpokenCommandUseCase.execute({
        transcript: transcript || '',
        language: language || 'pidgin',
        executionMode: executionMode || 'offline_slm',
      });

      if (result.isSuccess) {
        res.status(200).json({ success: true, data: result.getValue() });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}

