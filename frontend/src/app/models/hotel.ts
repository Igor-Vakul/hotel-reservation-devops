import { Room } from './room';
export interface Hotel { id: number; name: string; city: string; }
export interface Availability { rooms: Room[]; userHasConflict: boolean; }
