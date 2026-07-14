using Backend.Domain;
using Microsoft.EntityFrameworkCore;

namespace Backend.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Hotel> Hotels => Set<Hotel>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Room>().HasIndex(r => new { r.HotelId, r.Number }).IsUnique();
        b.Entity<Room>()
            .HasOne(r => r.Hotel).WithMany(h => h.Rooms)
            .HasForeignKey(r => r.HotelId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Room>().Property(r => r.Type).HasConversion<string>();
        b.Entity<Room>().Property(r => r.PricePerNight).HasPrecision(10, 2);

        b.Entity<Hotel>().HasData(
            new Hotel { Id = 1, Name = "Seaside Inn", City = "Brighton" },
            new Hotel { Id = 2, Name = "City Central", City = "London" }
        );
        b.Entity<Room>().HasData(
            new Room { Id = 1, HotelId = 1, Number = "101", Type = RoomType.Single, PricePerNight = 80m,  IsActive = true },
            new Room { Id = 2, HotelId = 1, Number = "102", Type = RoomType.Double, PricePerNight = 120m, IsActive = true },
            new Room { Id = 3, HotelId = 1, Number = "201", Type = RoomType.Suite,  PricePerNight = 250m, IsActive = true },
            new Room { Id = 4, HotelId = 2, Number = "101", Type = RoomType.Single, PricePerNight = 95m,  IsActive = true },
            new Room { Id = 5, HotelId = 2, Number = "102", Type = RoomType.Double, PricePerNight = 140m, IsActive = true },
            new Room { Id = 6, HotelId = 2, Number = "305", Type = RoomType.Suite,  PricePerNight = 300m, IsActive = true }
        );

        b.Entity<User>().HasIndex(u => u.Email).IsUnique();
        b.Entity<User>().Property(u => u.Role).HasDefaultValue("client");
        b.Entity<Reservation>()
            .HasOne(r => r.User).WithMany(u => u.Reservations)
            .HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.SetNull);
    }
}
