using System.Text;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;

namespace IngestionService.Brokers;

/// <summary>
/// MQTT (Mosquitto) producent. QoS se bira preko MQTT_QOS (0/1/2).
/// Otporan na prekid mreže (Scenario B): pri gubitku veze ne pada, već reconnect-uje
/// u pozadini; poruke generisane tokom prekida se odbacuju (realno ponašanje za QoS na
/// strani producenta — broker ih ne može primiti dok smo offline).
/// </summary>
public sealed class MqttPublisher : IMessagePublisher
{
    private readonly string _host;
    private readonly int _port;
    private readonly string _topic;
    private readonly MqttQualityOfServiceLevel _qos;
    private readonly IMqttClient _client;
    private readonly MqttClientOptions _options;
    private CancellationToken _ct;
    private int _reconnecting;          // 0/1 guard da ne pokrenemo više reconnect petlji
    private long _dropped;

    public long Dropped => Interlocked.Read(ref _dropped);

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

        _client.DisconnectedAsync += _ => { StartReconnect(); return Task.CompletedTask; };
    }

    public async Task ConnectAsync(CancellationToken ct)
    {
        _ct = ct;
        await _client.ConnectAsync(_options, ct);
        Console.WriteLine($"[MQTT] povezan na {_host}:{_port}, QoS={(int)_qos}, topic={_topic}");
    }

    public async Task PublishAsync(string key, string payload, CancellationToken ct)
    {
        if (!_client.IsConnected)        // mreža pala — odbaci poruku (ne ruši servis), reconnect ide u pozadini
        {
            Interlocked.Increment(ref _dropped);
            return;
        }

        try
        {
            var msg = new MqttApplicationMessageBuilder()
                .WithTopic(_topic)
                .WithPayload(Encoding.UTF8.GetBytes(payload))
                .WithQualityOfServiceLevel(_qos)
                .Build();
            await _client.PublishAsync(msg, ct);
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            Interlocked.Increment(ref _dropped);   // tranzijentna greška; DisconnectedAsync pokreće reconnect
        }
    }

    private void StartReconnect()
    {
        if (Interlocked.Exchange(ref _reconnecting, 1) == 1) return;  // već reconnect-ujemo
        _ = Task.Run(async () =>
        {
            while (!_ct.IsCancellationRequested && !_client.IsConnected)
            {
                try { await Task.Delay(2000, _ct); await _client.ConnectAsync(_options, _ct); }
                catch (OperationCanceledException) { break; }
                catch { /* mreža još nedostupna — probaj opet */ }
            }
            if (_client.IsConnected) Console.WriteLine("[MQTT] veza obnovljena nakon prekida.");
            Interlocked.Exchange(ref _reconnecting, 0);
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_client.IsConnected)
            await _client.DisconnectAsync();
        _client.Dispose();
    }
}
