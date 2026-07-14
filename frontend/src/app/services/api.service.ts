import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Room } from '../models/room';
import { Reservation, CreateReservation } from '../models/reservation';
import { Hotel, Availability } from '../models/hotel';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api';

  getRooms(): Observable<Room[]> { return this.http.get<Room[]>(`${this.base}/rooms`); }
  getMyReservations(): Observable<Reservation[]> {
    return this.http.get<Reservation[]>(`${this.base}/reservations`);
  }
  createReservation(dto: CreateReservation): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.base}/reservations`, dto);
  }
  getHotels(): Observable<Hotel[]> { return this.http.get<Hotel[]>(`${this.base}/hotels`); }
  getAvailableRooms(hotelId: number, checkIn: string, checkOut: string): Observable<Availability> {
    return this.http.get<Availability>(`${this.base}/hotels/${hotelId}/rooms/available`,
      { params: { checkIn, checkOut } });
  }
}
