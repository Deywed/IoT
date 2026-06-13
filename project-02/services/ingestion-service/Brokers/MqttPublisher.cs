using System.Text;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;

namespace IngestionService.Brokers;

/// <summary>MQTT (Mosquitto) producent. QoS se bira preko MQTT_QOS (0/1/2).</summary>
public sealed class MqttPublisher : IMessagePublisher
{
    private readonly string _host;
    private readonly int _port;
    private readonly string _topic;
    private readonly MqttQualityOfServiceLevel _qos;
    private readonly IMqttClient _client;
    private readonly MqttClientOptions _options;

    public MqttPublisher(string host, int port, string topic, int qos)
    {
        _host = host;
        _port = port;
        _topic = topic;
        _qos = (MqttQualityOfServiceLevel)qos;
        _client = new MqttFactory().CreateMqttClient();
        _options = new MqttClientOptionsBuilder()
            .WithTcpServer(_host, _port)
            .WithClientId($"ingestion-{Guid.NewGuid():N}")
            .WithCleanSession(true)   // producent ne treba trajnu sesiju
            .Build();
    }

    public async Task ConnectAsync(CancellationToken ct)
    {
        await _client.ConnectAsync(_options, ct);
        Console.WriteLine($"[MQTT] povezan na {_host}:{_port}, QoS={(int)_qos}, topic={_topic}");
    }

    public async Task PublishAsync(string key, string payload, CancellationToken ct)
    {
        // Jednostavan reconnect (bitno za Scenario B — prekid mreže).
        if (!_client.IsConnected)
            await _client.ConnectAsync(_options, ct);

        var msg = new MqttApplicationMessageBuilder()
            .WithTopic(_topic)
            .WithPayload(Encoding.UTF8.GetBytes(payload))
            .WithQualityOfServiceLevel(_qos)
            .Build();
        await _client.PublishAsync(msg, ct);
    }

    public async ValueTask DisposeAsync()
    {
        if (_client.IsConnected)
            await _client.DisconnectAsync();
        _client.Dispose();
    }
}
