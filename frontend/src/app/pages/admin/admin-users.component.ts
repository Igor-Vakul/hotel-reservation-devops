import { Component, inject, signal, OnInit } from '@angular/core';
import { AdminService } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { AdminUser } from '../../models/admin';

@Component({
  selector: 'app-admin-users',
  template: `
    <h1>Users</h1>
    <table>
      <thead><tr><th>Email</th><th>Name</th><th>Role</th><th></th></tr></thead>
      <tbody>
        @for (u of users(); track u.id) {
          <tr>
            <td>{{ u.email }}</td><td>{{ u.displayName }}</td><td>{{ u.role }}</td>
            <td>
              @if (u.email !== auth.email()) {
                @if (u.role === 'admin') {
                  <button type="button" (click)="setRole(u, 'client')">Make client</button>
                } @else {
                  <button type="button" (click)="setRole(u, 'admin')">Make admin</button>
                }
              } @else {
                <span>(you)</span>
              }
            </td>
          </tr>
        } @empty { <tr><td colspan="4">No users.</td></tr> }
      </tbody>
    </table>
  `,
})
export class AdminUsersComponent implements OnInit {
  private admin = inject(AdminService);
  auth = inject(AuthService);
  users = signal<AdminUser[]>([]);
  ngOnInit() { this.load(); }
  load() { this.admin.getUsers().subscribe(u => this.users.set(u)); }
  setRole(u: AdminUser, role: string) { this.admin.setUserRole(u.id, role).subscribe({ next: () => this.load(), error: () => this.load() }); }
}
