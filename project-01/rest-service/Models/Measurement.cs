namespace rest_service.Models;

public class Measurement
{
    public long     Id              { get; set; }
    public DateTime RecordedAt      { get; set; }
    public float?   OverallUsage    { get; set; }
    public float?   SolarGeneration { get; set; }
    public float?   FridgeKw        { get; set; }
    public float?   FurnaceKw       { get; set; }
    public float?   HomeOfficeKw    { get; set; }
    public float?   Temperature     { get; set; }
    public float?   Humidity        { get; set; }
    public string?  Summary         { get; set; }
}
