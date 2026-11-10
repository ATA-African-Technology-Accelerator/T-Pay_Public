import type { ITransitRepository } from '../../domain/repositories/ITransitRepository';
import { KoropeTrip } from '../../domain/KoropeTrip';
import { PassengerSeat } from '../../domain/entities/PassengerSeat';
import { Money } from '../../../../shared/domain/Money';
import { UniqueEntityId } from '../../../../shared/domain/Identifier';

const TRANSIT_STORAGE_KEY = 'tpay_korope_trip';

export class LocalStorageTransitRepository implements ITransitRepository {
  private activeTrip: KoropeTrip | null = null;

  constructor() {
    this.initDefaultTrip();
    this.loadFromStorage();
  }

  private initDefaultTrip(): void {
    const trip = KoropeTrip.create('Morufu Transport', 'Yaba Terminal ⇄ CMS Marina Express', 300, 7).getValue();
    // Seed pre-existing paid seats 1 to 5 to match existing prototype state
    trip.recordPassengerPayment('Amara Okafor', 'BLE-NODE-089', 'bluetooth_ble');
    trip.recordPassengerPayment('Chidi Eze', 'BLE-NODE-142', 'bluetooth_ble');
    trip.recordPassengerPayment('Tunde Bakare', 'WIFI-DIRECT-03', 'wifi_direct');
    trip.recordPassengerPayment('Blessing Udoh', 'PAYPAL-ESCROW-88', 'paypal_escrow');
    trip.recordPassengerPayment('Kelechi Nwosu', 'BLE-NODE-201', 'bluetooth_ble');
    trip.clearEvents();

    this.activeTrip = trip;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const stored = window.localStorage.getItem(TRANSIT_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const fare = Money.create(parsed.farePerSeat, 'NGN').getValue();
      const seats = parsed.seats.map(
        (s: any) =>
          new PassengerSeat({
            seatNumber: s.seatNumber,
            fareAmount: fare,
            isPaid: s.isPaid,
            passengerName: s.passengerName,
            passengerDeviceId: s.passengerDeviceId,
            paymentMethod: s.paymentMethod,
            paidAt: s.paidAt ? new Date(s.paidAt) : undefined,
          })
      );

      const trip = KoropeTrip.rehydrate(
        {
          driverName: parsed.driverName,
          vehicleType: parsed.vehicleType,
          routeName: parsed.routeName,
          farePerSeat: fare,
          totalSeats: parsed.totalSeats,
          seats,
        },
        new UniqueEntityId(parsed.id)
      );

      this.activeTrip = trip;
    } catch (e) {
      console.warn('[LocalStorageTransitRepository] load error:', e);
    }
  }

  private persist(): void {
    if (typeof window === 'undefined' || !window.localStorage || !this.activeTrip) return;
    try {
      const serialized = {
        id: this.activeTrip.id.toValue(),
        driverName: this.activeTrip.driverName,
        vehicleType: this.activeTrip.vehicleType,
        routeName: this.activeTrip.routeName,
        farePerSeat: this.activeTrip.farePerSeat.amount,
        totalSeats: this.activeTrip.totalSeats,
        seats: this.activeTrip.seats.map((s) => ({
          seatNumber: s.seatNumber,
          isPaid: s.isPaid,
          passengerName: s.passengerName,
          passengerDeviceId: s.passengerDeviceId,
          paymentMethod: s.paymentMethod,
          paidAt: s.paidAt?.toISOString(),
        })),
      };
      window.localStorage.setItem(TRANSIT_STORAGE_KEY, JSON.stringify(serialized));
    } catch (e) {
      console.warn('[LocalStorageTransitRepository] persist error:', e);
    }
  }

  public async getActiveTrip(): Promise<KoropeTrip> {
    if (!this.activeTrip) {
      this.initDefaultTrip();
    }
    return this.activeTrip!;
  }

  public async saveTrip(trip: KoropeTrip): Promise<void> {
    this.activeTrip = trip;
    this.persist();
  }
}
