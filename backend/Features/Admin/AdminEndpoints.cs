using Backend.Data;
using Backend.Features.Reservations;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Backend.Features.Admin;

public static class AdminEndpoints
{
    public static void MapAdmin(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin").RequireAuthorization(p => p.RequireRole("admin"));

        admin.MapGet("/users", async (AppDbContext db) =>
            await db.Users
                .Select(u => new AdminUserDto(u.Id, u.Email, u.DisplayName, u.Role, u.CreatedAt))
                .ToListAsync());

        admin.MapPatch("/users/{id:int}/role", async (int id, SetRoleDto dto, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if (dto.Role is not ("client" or "admin"))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["role"] = ["Role must be 'client' or 'admin'."] });
            var callerId = int.Parse(principal.FindFirstValue("sub")!);
            if (id == callerId)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["role"] = ["You cannot change your own role."] });
            var user = await db.Users.FindAsync(id);
            if (user is null) return Results.NotFound();
            if (user.Role == "admin" && dto.Role == "client")
            {
                var adminCount = await db.Users.CountAsync(u => u.Role == "admin");
                if (adminCount <= 1)
                    return Results.ValidationProblem(new Dictionary<string, string[]>
                        { ["role"] = ["There must be at least one admin."] });
            }
            user.Role = dto.Role;
            await db.SaveChangesAsync();
            return Results.Ok(new AdminUserDto(user.Id, user.Email, user.DisplayName, user.Role, user.CreatedAt));
        });

        admin.MapGet("/reservations", async (AppDbContext db) =>
            await db.Reservations.Include(r => r.Room)
                .Select(r => new ReservationDto(r.Id, r.RoomId, r.Room!.Number, r.GuestName, r.GuestEmail,
                    r.CheckIn, r.CheckOut, r.CreatedAt))
                .ToListAsync());
    }
}
