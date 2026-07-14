using Backend.Features.Rooms;
namespace Backend.Features.Hotels;
public record AvailabilityDto(IReadOnlyList<RoomDto> Rooms, bool UserHasConflict);
