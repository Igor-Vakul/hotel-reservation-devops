using System.Security.Claims;
using Backend.Data;
using Backend.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Features.Auth;

public static class AuthEndpoints
{
    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/register", async (RegisterDto dto, AppDbContext db,
            PasswordService pw, JwtService jwt) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                    { ["auth"] = ["Email and password are required."] });
            if (await db.Users.AnyAsync(u => u.Email == dto.Email))
                return Results.Conflict(new { message = "Email already registered." });

            var user = new User { Email = dto.Email, DisplayName = dto.DisplayName, Role = "client", CreatedAt = DateTime.UtcNow };
            user.PasswordHash = pw.Hash(user, dto.Password);
            db.Users.Add(user);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Email already registered." });
            }
            return Results.Ok(new AuthResultDto(jwt.CreateToken(user), user.Email, user.DisplayName, user.Role));
        });

        app.MapPost("/api/auth/login", async (LoginDto dto, AppDbContext db,
            PasswordService pw, JwtService jwt) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == dto.Email);
            if (user is null || !pw.Verify(user, user.PasswordHash, dto.Password))
                return Results.Unauthorized();
            return Results.Ok(new AuthResultDto(jwt.CreateToken(user), user.Email, user.DisplayName, user.Role));
        });

        app.MapGet("/api/me", (ClaimsPrincipal principal) =>
        {
            var email = principal.FindFirstValue("email") ?? "";
            return Results.Ok(new { email });
        }).RequireAuthorization();
    }
}
