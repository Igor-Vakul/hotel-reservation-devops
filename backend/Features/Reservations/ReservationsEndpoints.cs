using System.Data;
using System.Security.Claims;
using Backend.Data;
using Backend.Domain;
using Microsoft.EntityFrameworkCore;

namespace Backend.Features.Reservations;

public static class ReservationsEndpoints
{
    public static void MapReservations(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/reservations", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = int.Parse(principal.FindFirstValue("sub")!);
            var list = await db.Reservations.Include(r => r.Room)
                .Where(r => r.UserId == userId)
                .Select(r => Map(r)).ToListAsync();
            return Results.Ok(list);
        }).RequireAuthorization();

        app.MapGet("/api/reservations/{id:int}", async (int id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = int.Parse(principal.FindFirstValue("sub")!);
            var r = await db.Reservations.Include(x => x.Room)
                .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);
            return r is null ? Results.NotFound() : Results.Ok(Map(r));
        }).RequireAuthorization();

        app.MapPost("/api/reservations", async (CreateReservationDto dto, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = int.Parse(principal.FindFirstValue("sub")!);
            var user = await db.Users.FindAsync(userId);
            if (user is null) return Results.Unauthorized();

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var errors = ReservationRules.Validate(user.DisplayName, user.Email, dto.CheckIn, dto.CheckOut, today).ToList();
            var room = await db.Rooms.FindAsync(dto.RoomId);
            if (room is null || !room.IsActive) errors.Add("Room does not exist or is inactive.");
            if (errors.Count > 0)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["reservation"] = errors.ToArray() });

            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            try
            {
                var roomTaken = await db.Reservations.AnyAsync(r =>
                    r.RoomId == dto.RoomId && r.CheckIn < dto.CheckOut && dto.CheckIn < r.CheckOut);
                if (roomTaken)
                {
                    await tx.RollbackAsync();
                    return Results.Conflict(new { message = "Room is already booked for the selected dates." });
                }

                var userBusy = await db.Reservations.AnyAsync(r =>
                    r.UserId == userId && r.CheckIn < dto.CheckOut && dto.CheckIn < r.CheckOut);
                if (userBusy)
                {
                    await tx.RollbackAsync();
                    return Results.Conflict(new { message = "You already have a stay for these dates." });
                }

                var entity = new Reservation
                {
                    RoomId = dto.RoomId, UserId = userId, Room = room,
                    GuestName = user.DisplayName, GuestEmail = user.Email,
                    CheckIn = dto.CheckIn, CheckOut = dto.CheckOut, CreatedAt = DateTime.UtcNow
                };
                db.Reservations.Add(entity);
                await db.SaveChangesAsync();
                // Commit must be the LAST statement in the try: nothing after it may throw,
                // otherwise the catch would roll back an already-committed transaction.
                // Room is already loaded above (FindAsync), so Map() needs no extra round-trip.
                await tx.CommitAsync();
                return Results.Created($"/api/reservations/{entity.Id}", Map(entity));
            }
            catch (Exception)
            {
                await tx.RollbackAsync();
                return Results.Conflict(new { message = "That room was just booked — please try again." });
            }
        }).RequireAuthorization();
    }

    static ReservationDto Map(Reservation r) => new(
        r.Id, r.RoomId, r.Room?.Number ?? "", r.GuestName, r.GuestEmail, r.CheckIn, r.CheckOut, r.CreatedAt);
}
