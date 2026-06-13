import { Kafka, logLevel } from "kafkajs";

/** Kafka potrošač (consumer group). Nastavlja od commit-ovanog offset-a posle prekida. */
export async function startKafkaConsumer(onMessage: (payload: string) => void): Promise<void> {
  const brokers = [process.env.KAFKA_BOOTSTRAP || "kafka:9092"];
  const groupId = process.env.KAFKA_GROUP_ID || "analytics-group";
  const topic = process.env.TOPIC || "iot-measurements";

  const kafka = new Kafka({
    clientId: "analytics",
    brokers,
    logLevel: logLevel.NOTHING,
    retry: { retries: 30, initialRetryTime: 2000 },
  });

  // Idempotentno kreiranje topika (3 particije) — izbegava trku pri startu
  // (kafkajs je stroži od librdkafka i baca UNKNOWN_TOPIC_OR_PARTITION ako topik još ne postoji).
  const admin = kafka.admin();
  await admin.connect();
  await admin.createTopics({ topics: [{ topic, numPartitions: 3 }], waitForLeaders: true });
  await admin.disconnect();

  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });
  console.log(`[Kafka] Analytics pretplaćen: group=${groupId}, topic=${topic}`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (message.value) onMessage(message.value.toString());
    },
  });
}
