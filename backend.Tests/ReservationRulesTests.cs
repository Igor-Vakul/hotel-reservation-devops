using Backend.Data;
using Xunit;

public class ReservationRulesTests
{
    static DateOnly D(int day) => new(2026, 8, day);

    [Fact]
    public void Overlaps_true_when_intervals_intersect()
        => Assert.True(ReservationRules.Overlaps(D(10), D(15), D(12), D(20)));

    [Fact]
    public void Overlaps_false_when_touching_at_boundary()
        => Assert.False(ReservationRules.Overlaps(D(10), D(15), D(15), D(20)));

    [Fact]
    public void Validate_rejects_checkout_not_after_checkin()
        => Assert.NotEmpty(ReservationRules.Validate("Ann", "a@b.co", D(15), D(15), D(1)));

    [Fact]
    public void Validate_rejects_past_checkin()
        => Assert.NotEmpty(ReservationRules.Validate("Ann", "a@b.co", D(1), D(5), D(10)));

    [Fact]
    public void Validate_rejects_bad_email()
        => Assert.NotEmpty(ReservationRules.Validate("Ann", "not-an-email", D(10), D(12), D(1)));

    [Fact]
    public void Validate_passes_valid_input()
        => Assert.Empty(ReservationRules.Validate("Ann", "a@b.co", D(10), D(12), D(1)));
}
