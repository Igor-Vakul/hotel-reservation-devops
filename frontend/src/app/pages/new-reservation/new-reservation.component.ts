import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Hotel } from '../../models/hotel';
import { Room } from '../../models/room';

@Component({
  selector: 'app-new-reservation',
  imports: [ReactiveFormsModule, RouterLink],
  styles: [`.error { color: var(--rust); } .notice { color: var(--rust); }`],
  template: `
    <h1>New reservation</h1>

    <form [formGroup]="search" (ngSubmit)="find()">
      <label for="hotelId">Hotel</label>
      <select id="hotelId" formControlName="hotelId">
        @for (h of hotels(); track h.id) {
          <option [ngValue]="h.id">{{ h.name }} — {{ h.city }}</option>
        }
      </select>
      <label for="checkIn">Check-in</label>
      <input id="checkIn" type="date" formControlName="checkIn" />
      <label for="checkOut">Check-out</label>
      <input id="checkOut" type="date" formControlName="checkOut" />
      <button type="submit" [disabled]="search.invalid">Find available rooms</button>
    </form>

    @if (searched()) {
      @if (userHasConflict()) {
        <p class="notice" role="alert">You already have a stay for these dates.</p>
      } @else {
        <ul class="rooms">
          @for (r of available(); track r.id) {
            <li class="tag">
              <span class="disc">{{ r.number }}</span>
              <span class="type">{{ r.type }}</span>
              <span class="price">{{ r.pricePerNight }}/night</span>
              @if (auth.isLoggedIn()) {
                <button type="button" (click)="book(r.id)">Book</button>
              } @else {
                <a routerLink="/login">Log in to book</a>
              }
            </li>
          } @empty { <li>No rooms available for these dates.</li> }
        </ul>
      }
    }

    @if (ok()) { <p role="status">Booked! reservation #{{ ok() }}</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  `,
})
export class NewReservationComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  auth = inject(AuthService);
  hotels = signal<Hotel[]>([]);
  available = signal<Room[]>([]);
  userHasConflict = signal(false);
  searched = signal(false);
  ok = signal<number | null>(null);
  error = signal<string | null>(null);
  search = this.fb.nonNullable.group({
    hotelId: [0, Validators.required],
    checkIn: ['', Validators.required],
    checkOut: ['', Validators.required],
  });

  ngOnInit() {
    this.api.getHotels().subscribe(hs => {
      this.hotels.set(hs);
      if (hs.length) this.search.controls.hotelId.setValue(hs[0].id);
    });
  }

  find() {
    this.ok.set(null); this.error.set(null); this.searched.set(false);
    const { hotelId, checkIn, checkOut } = this.search.getRawValue();
    this.api.getAvailableRooms(hotelId, checkIn, checkOut).subscribe({
      next: a => { this.available.set(a.rooms); this.userHasConflict.set(a.userHasConflict); this.searched.set(true); },
      error: () => this.error.set('Could not load availability. Check the dates.'),
    });
  }

  book(roomId: number) {
    this.ok.set(null); this.error.set(null);
    const { checkIn, checkOut } = this.search.getRawValue();
    this.api.createReservation({ roomId, checkIn, checkOut }).subscribe({
      next: r => {
        // Show success and hide the (now stale) search block so the just-created
        // booking is not re-reported as a "you already have a stay" conflict.
        this.ok.set(r.id);
        this.searched.set(false);
        this.available.set([]);
        this.userHasConflict.set(false);
      },
      error: err => this.error.set(err?.error?.message
        ?? err?.error?.errors?.reservation?.[0] ?? 'Booking failed.'),
    });
  }
}
