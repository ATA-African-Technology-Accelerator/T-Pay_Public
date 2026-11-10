import type { ITransitRepository } from '../../domain/repositories/ITransitRepository';
import type { IProximityTransport } from '../../../../escrow/application/ports/IProximityTransport';
import { Result } from '../../../../shared/domain/Result';
import { DomainEventBus } from '../../../../shared/domain/DomainEventBus';
import type { CollectFaresResultDTO } from '../dtos/TransitDTOs';

export class CollectPassengerFaresUseCase {
  private transitRepo: ITransitRepository;
  private proximityTransport: IProximityTransport;

  constructor(
    transitRepo: ITransitRepository,
    proximityTransport: IProximityTransport
  ) {
    this.transitRepo = transitRepo;
    this.proximityTransport = proximityTransport;
  }

  public async execute(): Promise<Result<CollectFaresResultDTO>> {
    const trip = await this.transitRepo.getActiveTrip();
    if (trip.isFullyPaid) {
      return Result.ok({
        driverName: trip.driverName,
        totalSeats: trip.totalSeats,
        paidCount: trip.paidSeatsCount,
        unpaidCount: 0,
        isFullyPaid: true,
        newlyPaidPassengers: [],
        spokenDriverAlert: `All ${trip.totalSeats} seats are already fully paid. Ready to roll!`,
      });
    }

    // 1. Proximity scan for nearby passenger devices via BLE / Wi-Fi Direct
    const nearbyPeers = await this.proximityTransport.discoverPeers();
    const newlyPaid: {
      seatNumber: number;
      passengerName: string;
      fareFormatted: string;
      paymentMethod: string;
    }[] = [];

    // 2. Iterate unpaid seats and process payment for available peers
    for (const peer of nearbyPeers) {
      if (trip.isFullyPaid) break;
      // Filter out driver/shop devices
      if (peer.device.deviceId.includes('MORUFU') || peer.device.deviceId.includes('SHOP')) {
        continue;
      }

      // Check if already assigned
      const alreadyPaid = trip.seats.some((s) => s.passengerDeviceId === peer.device.deviceId);
      if (alreadyPaid) continue;

      const recordResult = trip.recordPassengerPayment(
        peer.device.name,
        peer.device.deviceId,
        peer.protocol === 'bluetooth_ble' ? 'bluetooth_ble' : 'wifi_direct'
      );

      if (recordResult.isSuccess) {
        const seat = recordResult.getValue();
        newlyPaid.push({
          seatNumber: seat.seatNumber,
          passengerName: seat.passengerName!,
          fareFormatted: seat.fareAmount.format(),
          paymentMethod: seat.paymentMethod!,
        });
      }
    }

    // 3. Persist and dispatch domain events
    await this.transitRepo.saveTrip(trip);
    await DomainEventBus.publishAll(trip.domainEvents);
    trip.clearEvents();

    // 4. Generate audio voice readout for the driver
    let spokenAlert = '';
    if (trip.isFullyPaid) {
      spokenAlert = `All ${trip.totalSeats} passengers have paid their ₦300 fare to ${trip.driverName}. Your bus is ready to move!`;
    } else {
      spokenAlert = `${trip.paidSeatsCount} passengers have paid. You have ${trip.unpaidSeatsCount} seat${trip.unpaidSeatsCount > 1 ? 's' : ''} left.`;
    }

    return Result.ok({
      driverName: trip.driverName,
      totalSeats: trip.totalSeats,
      paidCount: trip.paidSeatsCount,
      unpaidCount: trip.unpaidSeatsCount,
      isFullyPaid: trip.isFullyPaid,
      newlyPaidPassengers: newlyPaid,
      spokenDriverAlert: spokenAlert,
    });
  }
}
