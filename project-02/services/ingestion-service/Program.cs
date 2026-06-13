using System.Diagnostics;
using IngestionService.Brokers;
using IngestionService.Models;

// ── Data Ingestion Service ───────────────────────────────────────────────────
// Simulira IoT uređaje i šalje očitavanja u realnom vremenu na broker (MQTT/Kafka).
// Primarni generator opterećenja za merenja je emqtt-bench / kafka-perf;
// ovaj servis pokriva funkcionalni pipeline, Scenario B (prekid mreže) i Scenario D (alerting).

int deviceCount  = int.Parse(Environment.GetEnvironmentVariable("DEVICE_COUNT") ?? "100");
int msgRate      = int.Parse(Environment.GetEnvironmentVariable("MSG_RATE") ?? "10");
bool critical    = (Environment.GetEnvironmentVariable("CRITICAL_MODE") ?? "false")
                     .Equals("true", StringComparison.OrdinalIgnoreCase);

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };
AppDomain.CurrentDomain.ProcessExit += (_, _) => cts.Cancel();

await using var publisher = PublisherFactory.Create();
await ConnectWithRetry(publisher, cts.Token);

Console.WriteLine($"[Ingestion] uređaja={deviceCount}, rate={msgRate} msg/s/uređaj, " +
                  $"critical={critical} -> ciljano ~{deviceCount * msgRate} msg/s");

var rng = new Random();
var summaries = new[] { "Clear", "Cloudy", "Rainy", "Partly Cloudy" };

int intervalMs = Math.Max(1, 1000 / Math.Max(1, msgRate));
using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(intervalMs));
long sent = 0;
var sw = Stopwatch.StartNew();

try
{
    while (await timer.WaitForNextTickAsync(cts.Token))
    {
        for (int d = 0; d < deviceCount; d++)
        {
            var m = new Measurement
            {
                DeviceId        = $"dev-{d:D4}",
                ProducedAt      = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                // U critical modu šaljemo namerno visoke temperature (>50°C) -> alarm u Analytics.
                Temperature     = critical ? Round(55 + rng.NextDouble() * 15) : Round(5 + rng.NextDouble() * 30),
                Humidity        = Round(30 + rng.NextDouble() * 50),
                OverallUsage    = Round(1 + rng.NextDouble() * 14),
                SolarGeneration = Round(rng.NextDouble() * 8),
                FridgeKw        = Round(0.1 + rng.NextDouble() * 0.4, 3),
                FurnaceKw       = Round(rng.NextDouble() * 3),
                HomeOfficeKw    = Round(rng.NextDouble() * 0.5, 3),
                Summary         = summaries[rng.Next(summaries.Length)],
            };
            await publisher.PublishAsync(m.DeviceId, m.ToJson(), cts.Token);
            sent++;
        }

        if (sw.Elapsed.TotalSeconds >= 5)
        {
            Console.WriteLine($"[Ingestion] poslato={sent}, ~{sent / sw.Elapsed.TotalSeconds:F0} msg/s");
            sent = 0;
            sw.Restart();
        }
    }
}
catch (OperationCanceledException) { /* uredno gašenje */ }

Console.WriteLine("[Ingestion] zaustavljen.");

static double Round(double v, int digits = 2) => Math.Round(v, digits);

static async Task ConnectWithRetry(IMessagePublisher pub, CancellationToken ct)
{
    for (int attempt = 1; ; attempt++)
    {
        try { await pub.ConnectAsync(ct); return; }
        catch (Exception ex) when (attempt < 30)
        {
            Console.WriteLine($"[Ingestion] broker nedostupan ({ex.Message}); pokušaj {attempt}, čekam 2s…");
            await Task.Delay(2000, ct);
        }
    }
}
