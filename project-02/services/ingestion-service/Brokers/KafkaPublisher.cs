using Confluent.Kafka;

namespace IngestionService.Brokers;

/// <summary>Kafka producent. acks se bira preko KAFKA_ACKS (0/1/all), ključ = device_id (particionisanje).</summary>
public sealed class KafkaPublisher : IMessagePublisher
{
    private readonly string _topic;
    private readonly IProducer<string, string> _producer;

    public KafkaPublisher(string bootstrap, string topic, string acks)
    {
        _topic = topic;
        var config = new ProducerConfig
        {
            BootstrapServers = bootstrap,
            Acks = ParseAcks(acks),
            LingerMs = 5,              // mali batching na strani producenta (throughput)
        };
        _producer = new ProducerBuilder<string, string>(config).Build();
        Console.WriteLine($"[Kafka] producent spreman: bootstrap={bootstrap}, acks={acks}, topic={topic}");
    }

    private static Acks ParseAcks(string acks) => acks.ToLowerInvariant() switch
    {
        "0"   => Acks.None,
        "1"   => Acks.Leader,
        "all" => Acks.All,
        _     => Acks.Leader,
    };

    public Task ConnectAsync(CancellationToken ct) => Task.CompletedTask;

    public Task PublishAsync(string key, string payload, CancellationToken ct)
    {
        // Produce je asinhron (fire-and-forget uz interni red); ne čekamo svaku poruku radi propusnosti.
        _producer.Produce(_topic, new Message<string, string> { Key = key, Value = payload });
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        _producer.Flush(TimeSpan.FromSeconds(10));
        _producer.Dispose();
        return ValueTask.CompletedTask;
    }
}
