using System;
using System.Threading.Tasks;
using Grpc.Net.Client;
using IotProject;

// 1. Povezivanje na server
using var channel = GrpcChannel.ForAddress("http://localhost:50051");
var client = new SensorService.SensorServiceClient(channel);

//Scenario A
for (int i = 1; i <= 10; i++)
{
    var request = new MeasurementRequest
    {
        RecordedAt = DateTime.UtcNow.ToString("O"),
        Temperature = 22.5f + i,
        Humidity = 45.0f + i,
        UsageOverall = 1.2f * i,
        Summary = $"Merenje br. {i} sa .NET klijenta"
    };

    try
    {
        var response = await client.SaveMeasurementAsync(request);
    }
    catch (Exception ex)
    {
        Console.WriteLine($" Greška: {ex.Message}");
    }

    await Task.Delay(500);
}
