using System.Threading.Channels;
using Npgsql;
using NpgsqlTypes;
using StorageService.Models;

namespace StorageService.Db;

/// <summary>
/// Grupni upis u Postgres preko binarnog COPY-ja. Flush na svakih BATCH_SIZE poruka
/// ILI na svakih FLUSH_MS (da poslednje poruke ne čekaju). Ovo sprečava da disk I/O
/// postane usko grlo umesto samog brokera (napomena iz postavke).
/// </summary>
public sealed class BatchWriter
{
    private readonly string _connStr;
    private readonly int _batchSize;
    private readonly int _flushMs;
    private readonly Channel<Measurement> _channel = Channel.CreateUnbounded<Measurement>();
    private long _written;

    public BatchWriter(string connStr, int batchSize, int flushMs)
    {
        _connStr = connStr;
        _batchSize = batchSize;
        _flushMs = flushMs;
    }

    public long TotalWritten => Interlocked.Read(ref _written);

    /// <summary>Stavi poruku u red (poziva se iz potrošača, ne blokira).</summary>
    public void Enqueue(Measurement m) => _channel.Writer.TryWrite(m);

    public async Task RunAsync(CancellationToken ct)
    {
        var reader = _channel.Reader;
        var batch = new List<Measurement>(_batchSize);
        long lastFlush = Environment.TickCount64;

        while (!ct.IsCancellationRequested)
        {
            // Probudi se kad ima podataka ili najkasnije posle FLUSH_MS.
            using var wake = CancellationTokenSource.CreateLinkedTokenSource(ct);
            wake.CancelAfter(_flushMs);
            try { await reader.WaitToReadAsync(wake.Token); }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { /* flush tick */ }
            catch (OperationCanceledException) { break; }

            while (reader.TryRead(out var m))
            {
                batch.Add(m);
                if (batch.Count >= _batchSize)        // flush po veličini
                {
                    await Flush(batch, ct);
                    lastFlush = Environment.TickCount64;
                }
            }

            if (batch.Count > 0 && Environment.TickCount64 - lastFlush >= _flushMs)  // flush po vremenu
            {
                await Flush(batch, ct);
                lastFlush = Environment.TickCount64;
            }
        }

        if (batch.Count > 0) await Flush(batch, CancellationToken.None);  // završni flush
    }

    private async Task Flush(List<Measurement> batch, CancellationToken ct)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync(ct);
            await using var writer = await conn.BeginBinaryImportAsync(
                "COPY sensor_measurements (device_id, recorded_at, overall_usage, solar_generation, " +
                "fridge_kw, furnace_kw, home_office_kw, temperature, humidity, summary) " +
                "FROM STDIN (FORMAT BINARY)", ct);

            foreach (var m in batch)
            {
                await writer.StartRowAsync(ct);
                await writer.WriteAsync(m.DeviceId, NpgsqlDbType.Varchar, ct);
                await writer.WriteAsync(DateTimeOffset.FromUnixTimeMilliseconds(m.ProducedAt).UtcDateTime,
                                        NpgsqlDbType.TimestampTz, ct);
                await writer.WriteAsync((float)m.OverallUsage, NpgsqlDbType.Real, ct);
                await writer.WriteAsync((float)m.SolarGeneration, NpgsqlDbType.Real, ct);
                await writer.WriteAsync((float)m.FridgeKw, NpgsqlDbType.Real, ct);
                await writer.WriteAsync((float)m.FurnaceKw, NpgsqlDbType.Real, ct);
                await writer.WriteAsync((float)m.HomeOfficeKw, NpgsqlDbType.Real, ct);
                await writer.WriteAsync((float)m.Temperature, NpgsqlDbType.Real, ct);
                await writer.WriteAsync((float)m.Humidity, NpgsqlDbType.Real, ct);
                await writer.WriteAsync(m.Summary, NpgsqlDbType.Varchar, ct);
            }

            await writer.CompleteAsync(ct);
            Interlocked.Add(ref _written, batch.Count);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Storage] greška pri upisu batch-a ({batch.Count}): {ex.Message}");
        }
        finally
        {
            batch.Clear();
        }
    }
}
