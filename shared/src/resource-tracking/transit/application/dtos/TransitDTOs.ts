export interface CollectFaresResultDTO {
  driverName: string;
  totalSeats: number;
  paidCount: number;
  unpaidCount: number;
  isFullyPaid: boolean;
  newlyPaidPassengers: {
    seatNumber: number;
    passengerName: string;
    fareFormatted: string;
    paymentMethod: string;
  }[];
  spokenDriverAlert: string;
}

