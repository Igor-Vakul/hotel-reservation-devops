import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin',
  imports: [RouterLink],
  styles: [`nav { display: flex; gap: 1rem; flex-wrap: wrap; }`],
  template: `
    <h1>Admin</h1>
    <nav aria-label="Admin sections">
      <a routerLink="/admin/users">Users</a>
      <a routerLink="/admin/reservations">All reservations</a>
      <a routerLink="/admin/manage">Add hotels & rooms</a>
    </nav>
  `,
})
export class AdminComponent {}
