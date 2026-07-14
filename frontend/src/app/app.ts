import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  template: `
    <header class="nav">
      <a class="brand" routerLink="/rooms">STAY·LEDGER</a>
      <nav>
        <a routerLink="/rooms">Rooms</a>
        <a routerLink="/new">Book</a>
        @if (auth.isAdmin()) { <a routerLink="/admin">Admin</a> }
        @if (auth.isLoggedIn()) {
          <a routerLink="/my">My stays</a>
          <button type="button" (click)="auth.logout()">Log out</button>
        } @else {
          <a routerLink="/login">Log in</a>
        }
      </nav>
    </header>
    <main><router-outlet /></main>
  `,
})
export class App {
  auth = inject(AuthService);
}
