using System.Diagnostics;
using IngestionService.Brokers;
using IngestionService.Models;

// ── Data Ingestion Service ───────────────────────────────────────────────────
// Simulira IoT uređaje i šalje očitavanja u realnom vremenu na broker (MQTT/Kafka).
// Primarni generator opterećenja za merenja je emqtt-bench / kafka-perf;
// ovaj servis pokriva funkcionalni pipeline, Scenario B (prekid mreže) i Scenario D (alerting).

int deviceCount = int.Parse(Environment.GetEnvironmentVariable("DEVICE_COUNT") ?? "100");
int msgRate = int.Parse(Environment.GetEnvironmentVariable("MSG_RATE") ?? "10");
bool critical = (Environment.GetEnvironmentVariable("CRITICAL_MODE") ?? "false")
                     .Equals("true", StringComparison.OrdinalIgnoreCase);

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };
AppDomain.CurrentDomain.ProcessExit += (_, _) => cts.Cancel();

await using var publisher = PublisherFactory.Create();
await ConnectWithRetry(publisher, cts.Token);

Console.WriteLine($"[Ingestion] uređaja={deviceCount}, rate={msgRate} msg/s/uređaj, " +
                  $"critical={critical} -> ciljano ~{deviceCount * msgRate} msg/s");

var rng = new Random();

// ── Koherentna meteorologija (vremenska serija) ─────────────────────────────
// Globalno stanje vremena se sporo menja (random-walk po susednim stanjima),
// pa temperatura/vlažnost/solarna proizvodnja i summary imaju međusobni signal
// (isti generativni model kao MaaS `weather_gen.py`). Time klasifikacija vremena
// nad živim tokom postaje smislena (predviđeno ≈ stvarno).
// Indeks stanja (poređano po "vedrini"): 0=Clear, 1=Partly Cloudy, 2=Cloudy, 3=Rainy.
// Opsezi se preklapaju sa susednim stanjima -> klasifikacija nije trivijalna
// (isto kao MaaS `weather_gen.py`).
var conditions = new[] { "Clear", "Partly Cloudy", "Cloudy", "Rainy" };
double[,] tempRange = { { 18, 34 }, { 13, 29 }, { 8, 24 }, { 3, 19 } };            // °C
double[,] humRange = { { 20, 50 }, { 38, 65 }, { 52, 80 }, { 70, 97 } };           // %
double[,] solarRange = { { 4.0, 8.0 }, { 2.0, 5.5 }, { 0.6, 3.0 }, { 0.0, 1.4 } }; // kW
int weather = rng.Next(conditions.Length);
var weatherSw = Stopwatch.StartNew();

int intervalMs = Math.Max(1, 1000 / Math.Max(1, msgRate));
using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(intervalMs));
long sent = 0;
long failed = 0;
var sw = Stopwatch.StartNew();

try
{
    while (await timer.WaitForNextTickAsync(cts.Token))
    {
        // Sporo menjanje vremena (~ svakih 20s) — blage tranzicije između susednih stanja.
        if (weatherSw.Elapsed.TotalSeconds >= 20)
        {
            weather = Math.Clamp(weather + (rng.Next(2) == 0 ? -1 : 1), 0, conditions.Length - 1);
            weatherSw.Restart();
            Console.WriteLine($"[Ingestion] promena vremena -> {conditions[weather]}");
        }

        for (int d = 0; d < deviceCount; d++)
        {
            var m = new Measurement
            {
                DeviceId = $"dev-{d:D4}",
                ProducedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                // U critical modu namerno visoke temperature (>50°C) -> alarm (eKuiper HIGH_TEMP + Analytics).
                Temperature = critical ? Round(55 + rng.NextDouble() * 15) : Sample(tempRange),
                Humidity = Sample(humRange),
                OverallUsage = Round(1 + rng.NextDouble() * 14),
                SolarGeneration = Sample(solarRange),
                FridgeKw = Round(0.1 + rng.NextDouble() * 0.4, 3),
                FurnaceKw = Round(rng.NextDouble() * 3),
                HomeOfficeKw = Round(rng.NextDouble() * 0.5, 3),
                Summary = conditions[weather],
            };
            try
            {
                await publisher.PublishAsync(m.DeviceId, m.ToJson(), cts.Token);
                sent++;
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)   // prekid mreže / broker nedostupan — ne ruši simulator (Scenario B)
            {
                if (failed++ % 5000 == 0)
                    Console.WriteLine($"[Ingestion] greška pri slanju (nastavljam): {ex.Message}");
            }
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

// Uzorkuje vrednost iz opsega [lo, hi] tekućeg stanja vremena (uniformno + zaokruženo).
double Sample(double[,] range) => Round(range[weather, 0] + rng.NextDouble() * (range[weather, 1] - range[weather, 0]));

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
