using Backend.Domain;
using Backend.Features.Auth;
using Xunit;

public class PasswordServiceTests
{
    [Fact]
    public void Verify_true_for_correct_password()
    {
        var svc = new PasswordService();
        var user = new User { Email = "a@b.co" };
        var hash = svc.Hash(user, "secret123");
        Assert.True(svc.Verify(user, hash, "secret123"));
    }

    [Fact]
    public void Verify_false_for_wrong_password()
    {
        var svc = new PasswordService();
        var user = new User { Email = "a@b.co" };
        var hash = svc.Hash(user, "secret123");
        Assert.False(svc.Verify(user, hash, "wrong"));
    }

    [Fact]
    public void Hash_is_not_plaintext()
    {
        var svc = new PasswordService();
        var hash = svc.Hash(new User(), "secret123");
        Assert.NotEqual("secret123", hash);
    }
}
