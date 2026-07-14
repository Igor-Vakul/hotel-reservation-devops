namespace Backend.Features.Rooms;
public record RoomDto(int Id, string Number, string Type, decimal PricePerNight, bool IsActive,
    int HotelId, string HotelName);
