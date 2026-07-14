import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { ApiService } from '../../services/api.service';
import { Hotel } from '../../models/hotel';

@Component({
  selector: 'app-admin-manage',
  imports: [ReactiveFormsModule],
  styles: [`.msg { color: var(--rust); }`],
  template: `
    <h1>Add hotels & rooms</h1>

    <h2>New hotel</h2>
    <form [formGroup]="hotelForm" (ngSubmit)="addHotel()">
      <label for="hname">Name</label>
      <input id="hname" formControlName="name" />
      <label for="hcity">City</label>
      <input id="hcity" formControlName="city" />
      <button type="submit" [disabled]="hotelForm.invalid">Add hotel</button>
    </form>

    <h2>New room</h2>
    <form [formGroup]="roomForm" (ngSubmit)="addRoom()">
      <label for="rhotel">Hotel</label>
      <select id="rhotel" formControlName="hotelId">
        @for (h of hotels(); track h.id) { <option [ngValue]="h.id">{{ h.name }}</option> }
      </select>
      <label for="rnum">Number</label>
      <input id="rnum" formControlName="number" />
      <label for="rtype">Type</label>
      <select id="rtype" formControlName="type">
        <option value="Single">Single</option>
        <option value="Double">Double</option>
        <option value="Suite">Suite</option>
      </select>
      <label for="rprice">Price / night</label>
      <input id="rprice" type="number" formControlName="pricePerNight" />
      <button type="submit" [disabled]="roomForm.invalid">Add room</button>
    </form>

    @if (msg()) { <p class="msg" role="alert">{{ msg() }}</p> }
    @if (ok()) { <p role="status">{{ ok() }}</p> }
  `,
})
export class AdminManageComponent implements OnInit {
  private admin = inject(AdminService);
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  hotels = signal<Hotel[]>([]);
  msg = signal<string | null>(null);
  ok = signal<string | null>(null);

  hotelForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    city: ['', Validators.required],
  });
  roomForm = this.fb.nonNullable.group({
    hotelId: [0, Validators.required],
    number: ['', Validators.required],
    type: ['Single', Validators.required],
    pricePerNight: [100, Validators.required],
  });

  ngOnInit() { this.loadHotels(); }
  loadHotels() {
    this.api.getHotels().subscribe(hs => {
      this.hotels.set(hs);
      if (hs.length) this.roomForm.controls.hotelId.setValue(hs[0].id);
    });
  }
  addHotel() {
    this.reset();
    this.admin.createHotel(this.hotelForm.getRawValue()).subscribe({
      next: h => { this.ok.set('Hotel added: ' + h.name); this.hotelForm.reset({ name: '', city: '' }); this.loadHotels(); },
      error: e => this.msg.set(e?.error?.errors?.name?.[0] ?? 'Could not add hotel.'),
    });
  }
  addRoom() {
    this.reset();
    const { hotelId, ...rest } = this.roomForm.getRawValue();
    this.admin.createRoom(hotelId, rest).subscribe({
      next: r => this.ok.set('Room added: ' + r.number),
      error: e => this.msg.set(e?.error?.message ?? e?.error?.errors?.type?.[0] ?? 'Could not add room.'),
    });
  }
  private reset() { this.msg.set(null); this.ok.set(null); }
}
