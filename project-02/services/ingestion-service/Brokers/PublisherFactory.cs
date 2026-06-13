namespace IngestionService.Brokers;

/// <summary>Bira MQTT ili Kafka producenta na osnovu BROKER env promenljive.</summary>
public static class PublisherFactory
{
    public static IMessagePublisher Create()
    {
        var broker = (Environment.GetEnvironmentVariable("BROKER") ?? "mqtt").ToLowerInvariant();
        var topic = Environment.GetEnvironmentVariable("TOPIC") ?? "iot/measurements";

        return broker switch
        {
            "kafka" => new KafkaPublisher(
                bootstrap: Environment.GetEnvironmentVariable("KAFKA_BOOTSTRAP") ?? "kafka:9092",
                topic: topic,
                acks: Environment.GetEnvironmentVariable("KAFKA_ACKS") ?? "1"),

            _ => new MqttPublisher(
                host: Environment.GetEnvironmentVariable("MQTT_HOST") ?? "mosquitto",
                port: int.Parse(Environment.GetEnvironmentVariable("MQTT_PORT") ?? "1883"),
                topic: topic,
                qos: int.Parse(Environment.GetEnvironmentVariable("MQTT_QOS") ?? "1")),
        };
    }
}
