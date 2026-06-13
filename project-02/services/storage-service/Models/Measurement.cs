using System.Text.Json;
using System.Text.Json.Serialization;

namespace StorageService.Models;

/// <summary>Format poruke koji stiže sa brokera (isti JSON kao u Ingestion servisu).</summary>
public sealed class Measurement
{
    [JsonPropertyName("device_id")]      public string DeviceId { get; set; } = "";
    [JsonPropertyName("produced_at")]    public long ProducedAt { get; set; }
    [JsonPropertyName("temperature")]    public double Temperature { get; set; }
    [JsonPropertyName("humidity")]       public double Humidity { get; set; }
    [JsonPropertyName("overall_usage")]  public double OverallUsage { get; set; }
    [JsonPropertyName("solar_generation")] public double SolarGeneration { get; set; }
    [JsonPropertyName("fridge_kw")]      public double FridgeKw { get; set; }
    [JsonPropertyName("furnace_kw")]     public double FurnaceKw { get; set; }
    [JsonPropertyName("home_office_kw")] public double HomeOfficeKw { get; set; }
    [JsonPropertyName("summary")]        public string Summary { get; set; } = "";

    public static Measurement? Parse(string json)
    {
        try { return JsonSerializer.Deserialize<Measurement>(json); }
        catch { return null; }
    }
}
