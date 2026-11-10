import { KoropeTrip } from '../KoropeTrip';

export interface ITransitRepository {
  getActiveTrip(): Promise<KoropeTrip>;
  saveTrip(trip: KoropeTrip): Promise<void>;
}

