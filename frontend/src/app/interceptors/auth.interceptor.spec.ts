import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  beforeEach(() => {
    localStorage.setItem('hotel_token', 'tok');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
  });

  it('adds Authorization header when token present', () => {
    const http = TestBed.inject(HttpClient);
    const mock = TestBed.inject(HttpTestingController);
    http.get('/api/me').subscribe();
    const req = mock.expectOne('/api/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush({});
  });
});
