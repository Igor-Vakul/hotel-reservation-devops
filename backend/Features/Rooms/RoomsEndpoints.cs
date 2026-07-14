using Backend.Data;
using Microsoft.EntityFrameworkCore;

namespace Backend.Features.Rooms;

public static class RoomsEndpoints
{
    public static void MapRooms(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/rooms", async (AppDbContext db) =>
            await db.Rooms.Include(r => r.Hotel)
                .Select(r => new RoomDto(r.Id, r.Number, r.Type.ToString(), r.PricePerNight, r.IsActive,
                    r.HotelId, r.Hotel!.Name))
                .ToListAsync());
    }
}
