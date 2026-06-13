using System.Text;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;

namespace StorageService.Brokers;

/// <summary>
/// MQTT potrošač sa TRAJNOM sesijom (clean_session=false, fiksni clientId).
/// Bitno za Scenario B: posle ponovnog povezivanja broker re-isporučuje QoS 1/2 poruke.
/// </summary>
public sealed class MqttConsumer : IMessageConsumer
{
    private readonly string _host;
    private readonly int _port;
    private readonly string _topic;
    private readonly MqttQualityOfServiceLevel _qos;
    private readonly IMqttClient _client;
    private readonly MqttClientOptions _options;

    public MqttConsumer(string host, int port, string topic, int qos)
    {
        _host = host;
        _port = port;
        _topic = topic;
        _qos = (MqttQualityOfServiceLevel)qos;
        _client = new MqttFactory().CreateMqttClient();
        _options = new MqttClientOptionsBuilder()
            .WithTcpServer(_host, _port)
            .WithClientId("storage-mqtt")     // fiksni ID -> trajna sesija
            .WithCleanSession(false)
            .WithSessionExpiryInterval(3600)  // sesija (i red poruka) preživljava prekid
            .Build();
    }

    public async Task RunAsync(Action<string> onMessage, CancellationToken ct)
    {
        _client.ApplicationMessageReceivedAsync += e =>
        {
            onMessage(Encoding.UTF8.GetString(e.ApplicationMessage.PayloadSegment));
            return Task.CompletedTask;
        };

        // Auto-reconnect petlja (oporavak posle prekida mreže — Scenario B).
        _client.DisconnectedAsync += async _ =>
        {
            if (ct.IsCancellationRequested) return;
            await Task.Delay(2000, CancellationToken.None);
            try { await Reconnect(ct); } catch { /* sledeći ciklus */ }
        };

        await Reconnect(ct);
        Console.WriteLine($"[MQTT] Storage pretplaćen: {_host}:{_port}, QoS={(int)_qos}, topic={_topic}");

        // Drži servis živim dok se ne otkaže.
        try { await Task.Delay(Timeout.Infinite, ct); }
        catch (OperationCanceledException) { }
    }

    private async Task Reconnect(CancellationToken ct)
    {
        if (_client.IsConnected) return;
        await _client.ConnectAsync(_options, ct);
        await _client.SubscribeAsync(new MqttClientSubscribeOptionsBuilder()
            .WithTopicFilter(f => f.WithTopic(_topic).WithQualityOfServiceLevel(_qos))
            .Build(), ct);
    }

    public async ValueTask DisposeAsync()
    {
        if (_client.IsConnected) await _client.DisconnectAsync();
        _client.Dispose();
    }
}
