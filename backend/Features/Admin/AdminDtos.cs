namespace Backend.Features.Admin;

public record AdminUserDto(int Id, string Email, string DisplayName, string Role, DateTime CreatedAt);
public record SetRoleDto(string Role);
