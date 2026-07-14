import { Component, inject, signal, OnInit } from '@angular/core';
import { AdminService } from '../../services/admin.service';
import { Reservation } from '../../models/reservation';

@Component({
  selector: 'app-admin-reservations',
  template: `
    <h1>All reservations</h1>
    <ul>
      @for (r of items(); track r.id) {
        <li>#{{ r.roomNumber }} · {{ r.checkIn }} → {{ r.checkOut }} · {{ r.guestName }} ({{ r.guestEmail }})</li>
      } @empty { <li>No reservations.</li> }
    </ul>
  `,
})
export class AdminReservationsComponent implements OnInit {
  private admin = inject(AdminService);
  items = signal<Reservation[]>([]);
  ngOnInit() { this.admin.getAllReservations().subscribe(r => this.items.set(r)); }
}
