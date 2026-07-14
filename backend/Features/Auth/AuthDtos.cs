namespace Backend.Features.Auth;

public record RegisterDto(string Email, string Password, string DisplayName);
public record LoginDto(string Email, string Password);
public record AuthResultDto(string Token, string Email, string DisplayName, string Role);
