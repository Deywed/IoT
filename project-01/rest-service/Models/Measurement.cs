namespace rest_service.Models;

public class Measurement
{
    public int Id { get; set; }
    public DateTime RecordedAt { get; set; }
    public float OverallUsage { get; set; }
    public float Temperature { get; set; }
    public string Summary { get; set; }
}