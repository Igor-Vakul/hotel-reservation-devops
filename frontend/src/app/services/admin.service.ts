import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminUser, CreateHotel, CreateRoom } from '../models/admin';
import { Reservation } from '../models/reservation';
import { Hotel } from '../models/hotel';
import { Room } from '../models/room';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  getUsers(): Observable<AdminUser[]> { return this.http.get<AdminUser[]>('/api/admin/users'); }
  setUserRole(id: number, role: string): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`/api/admin/users/${id}/role`, { role });
  }
  getAllReservations(): Observable<Reservation[]> { return this.http.get<Reservation[]>('/api/admin/reservations'); }
  createHotel(dto: CreateHotel): Observable<Hotel> { return this.http.post<Hotel>('/api/hotels', dto); }
  createRoom(hotelId: number, dto: CreateRoom): Observable<Room> {
    return this.http.post<Room>(`/api/hotels/${hotelId}/rooms`, dto);
  }
}
