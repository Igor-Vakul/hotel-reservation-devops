import { Routes } from '@angular/router';
import { RoomsComponent } from './pages/rooms/rooms.component';
import { NewReservationComponent } from './pages/new-reservation/new-reservation.component';
import { MyReservationsComponent } from './pages/my-reservations/my-reservations.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { AdminComponent } from './pages/admin/admin.component';
import { AdminUsersComponent } from './pages/admin/admin-users.component';
import { AdminReservationsComponent } from './pages/admin/admin-reservations.component';
import { AdminManageComponent } from './pages/admin/admin-manage.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'rooms' },
  { path: 'rooms', component: RoomsComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'new', component: NewReservationComponent },
  { path: 'my', component: MyReservationsComponent, canActivate: [authGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  { path: 'admin/users', component: AdminUsersComponent, canActivate: [adminGuard] },
  { path: 'admin/reservations', component: AdminReservationsComponent, canActivate: [adminGuard] },
  { path: 'admin/manage', component: AdminManageComponent, canActivate: [adminGuard] },
];
