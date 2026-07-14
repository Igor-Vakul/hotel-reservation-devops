import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService; let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  it('gets rooms from /api/rooms', () => {
    service.getRooms().subscribe(rooms => expect(rooms.length).toBe(1));
    const req = httpMock.expectOne('/api/rooms');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, number: '101', type: 'Single', pricePerNight: 80, isActive: true }]);
    httpMock.verify();
  });

  it('gets hotels from /api/hotels', () => {
    service.getHotels().subscribe(h => expect(h.length).toBe(1));
    const req = httpMock.expectOne('/api/hotels');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, name: 'Seaside Inn', city: 'Brighton' }]);
    httpMock.verify();
  });

  it('gets availability with date params', () => {
    service.getAvailableRooms(1, '2026-09-10', '2026-09-12').subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/hotels/1/rooms/available');
    expect(req.request.params.get('checkIn')).toBe('2026-09-10');
    expect(req.request.params.get('checkOut')).toBe('2026-09-12');
    req.flush({ rooms: [], userHasConflict: false });
    httpMock.verify();
  });
});
