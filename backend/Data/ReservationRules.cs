using System.Net.Mail;

namespace Backend.Data;

public static class ReservationRules
{
    public static bool Overlaps(DateOnly aIn, DateOnly aOut, DateOnly bIn, DateOnly bOut)
        => aIn < bOut && bIn < aOut;

    public static IReadOnlyList<string> Validate(
        string guestName, string guestEmail, DateOnly checkIn, DateOnly checkOut, DateOnly today)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(guestName)) errors.Add("GuestName is required.");
        if (!IsEmail(guestEmail)) errors.Add("GuestEmail is invalid.");
        if (checkOut <= checkIn) errors.Add("CheckOut must be after CheckIn.");
        if (checkIn < today) errors.Add("CheckIn must not be in the past.");
        return errors;
    }

    static bool IsEmail(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return false;
        try { _ = new MailAddress(s); return true; } catch { return false; }
    }
}
