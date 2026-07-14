import { Reservation } from './reservation';
export interface AdminUser { id: number; email: string; displayName: string; role: string; createdAt: string; }
export interface CreateHotel { name: string; city: string; }
export interface CreateRoom { number: string; type: string; pricePerNight: number; }
export type { Reservation };
