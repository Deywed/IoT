namespace StorageService.Brokers;

/// <summary>
/// Apstrakcija potrošača — MQTT (trajna pretplata) ili Kafka (consumer group + offset).
/// `onMessage` se poziva za svaku primljenu JSON poruku.
/// </summary>
public interface IMessageConsumer : IAsyncDisposable
{
    Task RunAsync(Action<string> onMessage, CancellationToken ct);
}
