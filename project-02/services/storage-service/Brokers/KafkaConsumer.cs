using Confluent.Kafka;

namespace StorageService.Brokers;

/// <summary>
/// Kafka potrošač (consumer group). Posle prekida (Scenario B) nastavlja od poslednjeg
/// commit-ovanog offset-a; zaostatak je vidljiv kao Consumer Lag.
/// </summary>
public sealed class KafkaConsumer : IMessageConsumer
{
    private readonly string _topic;
    private readonly ConsumerConfig _config;

    public KafkaConsumer(string bootstrap, string groupId, string topic)
    {
        _topic = topic;
        _config = new ConsumerConfig
        {
            BootstrapServers = bootstrap,
            GroupId = groupId,
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,           // periodični commit offset-a
            AutoCommitIntervalMs = 5000,
        };
    }

    public Task RunAsync(Action<string> onMessage, CancellationToken ct)
    {
        // Consume() je blokirajući -> vrtimo ga na zasebnom Task-u.
        return Task.Run(() =>
        {
            using var consumer = new ConsumerBuilder<string, string>(_config).Build();
            consumer.Subscribe(_topic);
            Console.WriteLine($"[Kafka] Storage pretplaćen: group={_config.GroupId}, topic={_topic}");
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    var cr = consumer.Consume(ct);
                    if (cr?.Message?.Value is { } v) onMessage(v);
                }
            }
            catch (OperationCanceledException) { }
            finally { consumer.Close(); }  // uredan commit + napuštanje grupe
        }, ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
