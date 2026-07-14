import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService; let httpMock: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('stores token on login and reports logged in', () => {
    expect(service.isLoggedIn()).toBe(false);
    service.login({ email: 'a@b.co', password: 'x' }).subscribe();
    httpMock.expectOne('/api/auth/login').flush({ token: 't1', email: 'a@b.co', displayName: 'Ann', role: 'client' });
    expect(service.token()).toBe('t1');
    expect(service.isLoggedIn()).toBe(true);
    expect(service.currentUser()?.email).toBe('a@b.co');
  });

  it('logout clears token', () => {
    service.login({ email: 'a@b.co', password: 'x' }).subscribe();
    httpMock.expectOne('/api/auth/login').flush({ token: 't1', email: 'a@b.co', displayName: 'Ann', role: 'client' });
    service.logout();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('reports admin after an admin login', () => {
    service.login({ email: 'a@b.co', password: 'x' }).subscribe();
    httpMock.expectOne('/api/auth/login').flush({ token: 't', email: 'a@b.co', displayName: 'A', role: 'admin' });
    expect(service.isAdmin()).toBe(true);
  });
});
