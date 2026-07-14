namespace Backend.Domain;

public enum RoomType { Single, Double, Suite }

public class Room
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public RoomType Type { get; set; }
    public decimal PricePerNight { get; set; }
    public bool IsActive { get; set; } = true;
    public int HotelId { get; set; }
    public Hotel? Hotel { get; set; }
    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
}
