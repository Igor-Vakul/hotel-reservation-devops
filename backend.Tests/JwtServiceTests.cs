using System.IdentityModel.Tokens.Jwt;
using Backend.Domain;
using Backend.Features.Auth;
using Microsoft.Extensions.Configuration;
using Xunit;

public class JwtServiceTests
{
    static JwtService Make()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = "test-secret-that-is-long-enough-1234567890",
            ["Jwt:Issuer"] = "hotel-api-test",
            ["Jwt:ExpiryMinutes"] = "120",
        }).Build();
        return new JwtService(config);
    }

    [Fact]
    public void Token_carries_sub_and_email()
    {
        var token = Make().CreateToken(new User { Id = 7, Email = "a@b.co" });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal("7", jwt.Claims.First(c => c.Type == "sub").Value);
        Assert.Equal("a@b.co", jwt.Claims.First(c => c.Type == "email").Value);
    }

    [Fact]
    public void Token_expiry_is_in_the_future()
    {
        var token = Make().CreateToken(new User { Id = 1, Email = "x@y.z" });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.True(jwt.ValidTo > DateTime.UtcNow);
    }

    [Fact]
    public void Token_carries_role()
    {
        var token = Make().CreateToken(new User { Id = 3, Email = "a@b.co", Role = "admin" });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal("admin", jwt.Claims.First(c => c.Type == "role").Value);
    }
}
