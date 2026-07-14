import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  styles: [`.error { color: var(--rust); }`],
  template: `
    <h1>Log in</h1>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label for="email">Email</label>
      <input id="email" type="email" formControlName="email" />
      <label for="password">Password</label>
      <input id="password" type="password" formControlName="password" />
      <button type="submit" [disabled]="form.invalid">Log in</button>
    </form>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    <p>No account? <a routerLink="/register">Register</a></p>
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  error = signal<string | null>(null);
  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  submit() {
    this.error.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/rooms']),
      error: () => this.error.set('Invalid email or password.'),
    });
  }
}
