import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  styles: [`.error { color: var(--rust); }`],
  template: `
    <h1>Create account</h1>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label for="displayName">Name</label>
      <input id="displayName" formControlName="displayName" />
      <label for="email">Email</label>
      <input id="email" type="email" formControlName="email" />
      <label for="password">Password</label>
      <input id="password" type="password" formControlName="password" />
      <button type="submit" [disabled]="form.invalid">Register</button>
    </form>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    <p>Have an account? <a routerLink="/login">Log in</a></p>
  `,
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  error = signal<string | null>(null);
  form = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });
  submit() {
    this.error.set(null);
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/rooms']),
      error: (e) => this.error.set(e.status === 409 ? 'Email already registered.' : 'Registration failed.'),
    });
  }
}
