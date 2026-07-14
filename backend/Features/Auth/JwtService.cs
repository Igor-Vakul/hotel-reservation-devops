using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Backend.Domain;
using Microsoft.IdentityModel.Tokens;

namespace Backend.Features.Auth;

public class JwtService(IConfiguration config)
{
    public string CreateToken(User user)
    {
        var secret = config["Jwt:Secret"]!;
        var issuer = config["Jwt:Issuer"];
        var minutes = int.Parse(config["Jwt:ExpiryMinutes"] ?? "120");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("role", user.Role),
        };
        var token = new JwtSecurityToken(
            issuer: issuer, audience: issuer, claims: claims,
            expires: DateTime.UtcNow.AddMinutes(minutes), signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
