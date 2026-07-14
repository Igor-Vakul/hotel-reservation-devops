import { Component, inject, signal, OnInit } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { Reservation } from '../../models/reservation';

@Component({
  selector: 'app-my-reservations',
  template: `
    <h1>My stays</h1>
    <ul>
      @for (r of items(); track r.id) {
        <li>#{{ r.roomNumber }} · {{ r.checkIn }} → {{ r.checkOut }}</li>
      } @empty {
        <li>You have no reservations yet.</li>
      }
    </ul>
  `,
})
export class MyReservationsComponent implements OnInit {
  private api = inject(ApiService);
  items = signal<Reservation[]>([]);
  ngOnInit() { this.api.getMyReservations().subscribe(r => this.items.set(r)); }
}
