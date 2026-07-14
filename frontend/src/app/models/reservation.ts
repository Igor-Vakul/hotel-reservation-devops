export interface Reservation {
  id: number; roomId: number; roomNumber: string;
  guestName: string; guestEmail: string; checkIn: string; checkOut: string; createdAt: string;
}
export interface CreateReservation {
  roomId: number; checkIn: string; checkOut: string;
}
