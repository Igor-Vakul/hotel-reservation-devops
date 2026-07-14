namespace Backend.Features.Reservations;

public record CreateReservationDto(int RoomId, DateOnly CheckIn, DateOnly CheckOut);

public record ReservationDto(int Id, int RoomId, string RoomNumber, string GuestName,
    string GuestEmail, DateOnly CheckIn, DateOnly CheckOut, DateTime CreatedAt);
