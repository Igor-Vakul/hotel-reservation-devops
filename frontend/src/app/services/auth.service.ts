import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { AuthResult, Credentials, RegisterInput } from '../models/auth';

const KEY = 'hotel_token';
const ROLE_KEY = 'hotel_role';
const EMAIL_KEY = 'hotel_email';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  token = signal<string | null>(localStorage.getItem(KEY));
  role = signal<string | null>(localStorage.getItem(ROLE_KEY));
  email = signal<string | null>(localStorage.getItem(EMAIL_KEY));
  currentUser = signal<{ email: string; displayName: string } | null>(null);
  isLoggedIn = computed(() => this.token() !== null);
  isAdmin = computed(() => this.role() === 'admin');

  login(c: Credentials) { return this.post('/api/auth/login', c); }
  register(r: RegisterInput) { return this.post('/api/auth/register', r); }

  private post(url: string, body: unknown) {
    return this.http.post<AuthResult>(url, body).pipe(tap(res => {
      localStorage.setItem(KEY, res.token);
      this.token.set(res.token);
      localStorage.setItem(ROLE_KEY, res.role);
      this.role.set(res.role);
      localStorage.setItem(EMAIL_KEY, res.email);
      this.email.set(res.email);
      this.currentUser.set({ email: res.email, displayName: res.displayName });
    }));
  }

  logout() {
    localStorage.removeItem(KEY);
    this.token.set(null);
    localStorage.removeItem(ROLE_KEY);
    this.role.set(null);
    localStorage.removeItem(EMAIL_KEY);
    this.email.set(null);
    this.currentUser.set(null);
  }
}
