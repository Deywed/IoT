using System;
using System.Threading.Tasks;
using Grpc.Net.Client;
using IotProject;

// 1. Povezivanje na Go server (localhost:50051)
using var channel = GrpcChannel.ForAddress("http://localhost:50051");
var client = new SensorService.SensorServiceClient(channel);

Console.WriteLine("🚀 .NET Senzor Simulator pokrenut...");

// Simuliramo Scenario A: Šaljemo 10 merenja u nizu
for (int i = 1; i <= 10; i++)
{
    var request = new MeasurementRequest
    {
        RecordedAt = DateTime.UtcNow.ToString("O"), // ISO 8601 format
        Temperature = 22.5f + i,
        Humidity = 45.0f + i,
        UsageOverall = 1.2f * i,
        Summary = $"Merenje br. {i} sa .NET klijenta"
    };

    try
    {
        var response = await client.SaveMeasurementAsync(request);
        Console.WriteLine($"[Server kaže]: {response.Message} (Success: {response.Success})");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"❌ Greška: {ex.Message}");
    }

    // Mala pauza između slanja da ne "ubijemo" bazu odmah
    await Task.Delay(500);
}

Console.WriteLine("✅ Simulacija gotova.");