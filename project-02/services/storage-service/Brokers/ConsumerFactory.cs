namespace StorageService.Brokers;

/// <summary>Bira MQTT ili Kafka potrošača na osnovu BROKER env promenljive.</summary>
public static class ConsumerFactory
{
    public static IMessageConsumer Create()
    {
        var broker = (Environment.GetEnvironmentVariable("BROKER") ?? "mqtt").ToLowerInvariant();
        var topic = Environment.GetEnvironmentVariable("TOPIC") ?? "iot/measurements";

        return broker switch
        {
            "kafka" => new KafkaConsumer(
                bootstrap: Environment.GetEnvironmentVariable("KAFKA_BOOTSTRAP") ?? "kafka:9092",
                groupId: Environment.GetEnvironmentVariable("KAFKA_GROUP_ID") ?? "storage-group",
                topic: topic),

            _ => new MqttConsumer(
                host: Environment.GetEnvironmentVariable("MQTT_HOST") ?? "mosquitto",
                port: int.Parse(Environment.GetEnvironmentVariable("MQTT_PORT") ?? "1883"),
                topic: topic,
                qos: int.Parse(Environment.GetEnvironmentVariable("MQTT_QOS") ?? "1")),
        };
    }
}
