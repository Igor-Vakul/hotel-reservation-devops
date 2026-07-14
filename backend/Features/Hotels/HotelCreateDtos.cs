namespace Backend.Features.Hotels;

public record CreateHotelDto(string Name, string City);
public record CreateRoomDto(string Number, string Type, decimal PricePerNight);
