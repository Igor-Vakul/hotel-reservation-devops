import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { Room } from '../../models/room';

@Component({
  selector: 'app-rooms',
  template: `
    <h1>Rooms</h1>
    @for (group of grouped(); track group.hotelName) {
      <section>
        <h2>{{ group.hotelName }}</h2>
        <ul class="rooms">
          @for (r of group.rooms; track r.id) {
            <li class="tag">
              <span class="disc">{{ r.number }}</span>
              <span class="type">{{ r.type }}</span>
              <span class="price">{{ r.pricePerNight }}/night</span>
            </li>
          }
        </ul>
      </section>
    } @empty { <p>No rooms available.</p> }
  `,
})
export class RoomsComponent implements OnInit {
  private api = inject(ApiService);
  rooms = signal<Room[]>([]);
  grouped = computed(() => {
    const byHotel = new Map<string, Room[]>();
    for (const r of this.rooms()) {
      const list = byHotel.get(r.hotelName) ?? [];
      list.push(r);
      byHotel.set(r.hotelName, list);
    }
    return [...byHotel.entries()].map(([hotelName, rooms]) => ({ hotelName, rooms }));
  });
  ngOnInit() { this.api.getRooms().subscribe(r => this.rooms.set(r)); }
}
