using System.Security.Claims;
using Backend.Data;
using Backend.Domain;
using Backend.Features.Rooms;
using Microsoft.EntityFrameworkCore;

namespace Backend.Features.Hotels;

public static class HotelsEndpoints
{
    public static void MapHotels(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/hotels", async (AppDbContext db) =>
            await db.Hotels
                .Select(h => new HotelDto(h.Id, h.Name, h.City))
                .ToListAsync());

        app.MapGet("/api/hotels/{hotelId:int}/rooms/available",
            async (int hotelId, DateOnly checkIn, DateOnly checkOut, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (checkOut <= checkIn)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["dates"] = ["CheckOut must be after CheckIn."] });

            var rooms = await db.Rooms
                .Where(r => r.HotelId == hotelId && r.IsActive)
                .Where(r => !db.Reservations.Any(res =>
                    res.RoomId == r.Id && res.CheckIn < checkOut && checkIn < res.CheckOut))
                .Include(r => r.Hotel)
                .Select(r => new RoomDto(r.Id, r.Number, r.Type.ToString(), r.PricePerNight, r.IsActive,
                    r.HotelId, r.Hotel!.Name))
                .ToListAsync();

            // Public endpoint: anyone can check availability. The per-user conflict flag
            // (Rule B) is only meaningful when authenticated; for anonymous callers it stays false.
            var userHasConflict = false;
            if (int.TryParse(principal.FindFirstValue("sub"), out var userId))
                userHasConflict = await db.Reservations.AnyAsync(res =>
                    res.UserId == userId && res.CheckIn < checkOut && checkIn < res.CheckOut);

            return Results.Ok(new AvailabilityDto(rooms, userHasConflict));
        });

        var adminHotels = app.MapGroup("/api/hotels").RequireAuthorization(p => p.RequireRole("admin"));

        adminHotels.MapPost("", async (CreateHotelDto dto, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required."] });
            var hotel = new Hotel { Name = dto.Name, City = dto.City };
            db.Hotels.Add(hotel);
            await db.SaveChangesAsync();
            return Results.Created($"/api/hotels/{hotel.Id}", new HotelDto(hotel.Id, hotel.Name, hotel.City));
        });

        adminHotels.MapPost("/{hotelId:int}/rooms", async (int hotelId, CreateRoomDto dto, AppDbContext db) =>
        {
            var hotel = await db.Hotels.FindAsync(hotelId);
            if (hotel is null) return Results.NotFound(new { message = "Hotel not found." });
            if (string.IsNullOrWhiteSpace(dto.Number))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["number"] = ["Number is required."] });
            if (!Enum.TryParse<RoomType>(dto.Type, ignoreCase: true, out var type))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["type"] = ["Type must be Single, Double, or Suite."] });
            var room = new Room { HotelId = hotelId, Number = dto.Number, Type = type,
                PricePerNight = dto.PricePerNight, IsActive = true };
            db.Rooms.Add(room);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "A room with that number already exists in this hotel." });
            }
            return Results.Created($"/api/rooms/{room.Id}",
                new RoomDto(room.Id, room.Number, room.Type.ToString(), room.PricePerNight, room.IsActive, hotel.Id, hotel.Name));
        });
    }
}
