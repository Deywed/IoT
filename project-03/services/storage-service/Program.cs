using System.Diagnostics;
using StorageService.Brokers;
using StorageService.Db;
using StorageService.Models;

// ── Data Storage Service ─────────────────────────────────────────────────────
// Pretplaćen na broker; grupno (batch) upisuje poruke u PostgreSQL.
// STORAGE_WRITE_ENABLED=false -> bez upisa (samo broji) da bi pri stres-testovima
// (Scenariji A i C) usko grlo bio broker, a ne disk I/O.

bool writeEnabled = (Environment.GetEnvironmentVariable("STORAGE_WRITE_ENABLED") ?? "true")
                      .Equals("true", StringComparison.OrdinalIgnoreCase);
int batchSize     = int.Parse(Environment.GetEnvironmentVariable("STORAGE_BATCH_SIZE") ?? "500");
int flushMs       = int.Parse(Environment.GetEnvironmentVariable("STORAGE_FLUSH_MS") ?? "2000");
string connStr    = Environment.GetEnvironmentVariable("DB_CONN")
                    ?? "Host=db;Database=mydb;Username=myuser;Password=mypassword";

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };
AppDomain.CurrentDomain.ProcessExit += (_, _) => cts.Cancel();

await using var consumer = ConsumerFactory.Create();

long received = 0;
var sw = Stopwatch.StartNew();
BatchWriter? batchWriter = writeEnabled ? new BatchWriter(connStr, batchSize, flushMs) : null;

Console.WriteLine($"[Storage] writeEnabled={writeEnabled}, batchSize={batchSize}, flushMs={flushMs}");

void OnMessage(string payload)
{
    Interlocked.Increment(ref received);
    if (batchWriter is not null && Measurement.Parse(payload) is { } m)
        batchWriter.Enqueue(m);

    var elapsed = sw.Elapsed.TotalSeconds;
    if (elapsed >= 5)
    {
        long r = Interlocked.Exchange(ref received, 0);
        sw.Restart();
        long w = batchWriter?.TotalWritten ?? 0;
        Console.WriteLine($"[Storage] primljeno ~{r / elapsed:F0} msg/s (upisano ukupno={w})");
    }
}

var tasks = new List<Task> { consumer.RunAsync(OnMessage, cts.Token) };
if (batchWriter is not null) tasks.Add(batchWriter.RunAsync(cts.Token));

try { await Task.WhenAll(tasks); }
catch (OperationCanceledException) { }

Console.WriteLine("[Storage] zaustavljen.");
