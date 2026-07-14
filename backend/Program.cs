using Backend.Data;
using Backend.Features.Admin;
using Backend.Features.Auth;
using Backend.Features.Hotels;
using Backend.Features.Reservations;
using Backend.Features.Rooms;
using Microsoft.EntityFrameworkCore;
using Prometheus;

var builder = WebApplication.CreateBuilder(args);

var conn = builder.Configuration.GetConnectionString("Default");
// Explicit server version (NOT AutoDetect): AutoDetect opens a DB connection when
// options are built, which would make design-time `dotnet ef migrations add`
// require a live MySQL. A fixed version keeps migrations fully offline.
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseMySql(conn, new MySqlServerVersion(new Version(8, 0, 0))));

builder.Services.AddScoped<PasswordService>();
builder.Services.AddScoped<JwtService>();

var jwtSecret = builder.Configuration["Jwt:Secret"]!;
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
    throw new InvalidOperationException("Jwt:Secret must be set and at least 32 characters (HS256 requires a 256-bit key).");
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
builder.Services.AddAuthentication(Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // read 'sub'/'email' by raw name
        options.TokenValidationParameters = new Microsoft.IdentityModel.Tokens.TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtIssuer,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(
                System.Text.Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateLifetime = true,
            RoleClaimType = "role",
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

// Database migrations + admin seed run ONLY as a one-off migration Job:
//   dotnet backend.dll migrate
// Normal app startup skips this, so the 5 backend replicas never migrate concurrently.
if (args.Contains("migrate"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // Retry to tolerate MySQL not being ready yet.
    for (var attempt = 1; attempt <= 10; attempt++)
    {
        try { db.Database.Migrate(); break; }
        catch when (attempt < 10) { Thread.Sleep(3000); }
    }

    var adminEmail = app.Configuration["Admin:Email"];
    var adminPassword = app.Configuration["Admin:Password"];
    if (!string.IsNullOrWhiteSpace(adminEmail) && !string.IsNullOrWhiteSpace(adminPassword)
        && !db.Users.Any(u => u.Email == adminEmail))
    {
        var pw = scope.ServiceProvider.GetRequiredService<Backend.Features.Auth.PasswordService>();
        var admin = new Backend.Domain.User
        {
            Email = adminEmail, DisplayName = "Administrator", Role = "admin", CreatedAt = DateTime.UtcNow
        };
        admin.PasswordHash = pw.Hash(admin, adminPassword);
        db.Users.Add(admin);
        try { db.SaveChanges(); }
        catch (DbUpdateException) { /* another instance already seeded the admin */ }
    }

    return; // migration Job finished — do not start the web server
}

// Record Prometheus metrics for every HTTP request (rate, duration, in-flight).
// Placed early so it wraps the whole pipeline.
app.UseHttpMetrics();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok("ok"));
// Expose the Prometheus scrape endpoint at GET /metrics (scraped via a ServiceMonitor).
app.MapMetrics();
app.MapRooms();
app.MapHotels();
app.MapReservations();
app.MapAuth();
app.MapAdmin();

app.Run();
