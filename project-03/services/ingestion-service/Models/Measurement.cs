using System.Text.Json;
using System.Text.Json.Serialization;

namespace IngestionService.Models;

/// <summary>
/// Deljeni format poruke (JSON) — isti za MQTT i Kafku, čitljiv i iz .NET-a i iz Node-a.
/// `produced_at` je epoch ms u trenutku generisanja na uređaju (osnova za end-to-end latenciju).
/// </summary>
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
    [JsonPropertyName("summary")]        public string Summary { get; set; } = "Clear";

    public static readonly JsonSerializerOptions JsonOpts = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };

    public string ToJson() => JsonSerializer.Serialize(this, JsonOpts);
}
