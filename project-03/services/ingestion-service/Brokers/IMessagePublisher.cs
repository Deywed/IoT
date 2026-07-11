namespace IngestionService.Brokers;

/// <summary>
/// Apstrakcija nad brokerom — jedan interfejs, dve implementacije (MQTT / Kafka).
/// Konkretnu bira <see cref="PublisherFactory"/> na osnovu BROKER env promenljive.
/// </summary>
public interface IMessagePublisher : IAsyncDisposable
{
    Task ConnectAsync(CancellationToken ct);

    /// <param name="key">particioni ključ (device_id) — koristi se kod Kafke; MQTT ga ignoriše</param>
    /// <param name="payload">serijalizovana JSON poruka</param>
    Task PublishAsync(string key, string payload, CancellationToken ct);
}
