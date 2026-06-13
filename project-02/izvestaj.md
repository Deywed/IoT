# Tehnički izveštaj — Projekat 2

**IoT mikroservisi zasnovani na događajima — uporedna evaluacija MQTT-a i Kafke**

> Skelet izveštaja. Polja `[____]` popuniti merenjima iz `benchmarks/results/` nakon
> sprovedenih eksperimenata.

## 1. Kratak opis urađenog

Implementiran je asinhroni, event-driven sistem od tri mikroservisa (Ingestion, Storage,
Analytics) koji ista logika pokreće nad dva broker-a — **MQTT (Mosquitto)** i **Apache Kafka
(KRaft režim, bez Zookeeper-a)**. Broker se bira profilom Docker Compose-a, a servisi koriste
zajednički kod sa adapterima za oba broker-a (`BROKER` env).

- **Ingestion (.NET):** simulira IoT uređaje; publikuje JSON merenja sa `produced_at` (epoch ms)
  i `device_id` (Kafka particioni ključ).
- **Storage (.NET, Npgsql):** pretplata + grupni upis (binarni `COPY`) na svakih 500 poruka;
  opcionalno isključenje upisa (`STORAGE_WRITE_ENABLED=false`) za stres-testove.
- **Analytics (Node.js/TS):** tumbling window od 10 s; prosek/maks temperature; **kritičan
  alarm** kada prosek pređe prag (50 °C); merenje end-to-end latencije.

Model podataka je isti kao u Projektu 1 (`sensor_measurements`), prošireno sa `device_id`,
`recorded_at` (= `produced_at`) i `received_at`.

## 2. Konfiguracija eksperimenata

- **MQTT:** QoS 0 / 1 / 2 (at most / at least / exactly once); perzistentne (trajne) pretplate.
- **Kafka:** acks 0 / 1 / all; topik sa 3 particije; odvojene consumer grupe za Storage i Analytics.
- **Alati:** emqtt-bench (MQTT), `kafka-producer-perf-test.sh` (Kafka), `docker stats` (resursi).
- **Hardver/okruženje:** `[____ CPU / RAM / OS ____]`

## 3. Uporedna tabela performansi

### Scenario A — Massive Sensor Ingestion (throughput + % gubitka)

| Broker | Param | 100 uređaja | 1000 uređaja | 10000 uređaja |
|---|---|---|---|---|
| MQTT | QoS 0 | `[__ msg/s, __% ]` | `[____]` | `[____]` |
| MQTT | QoS 1 | `[____]` | `[____]` | `[____]` |
| MQTT | QoS 2 | `[____]` | `[____]` | `[____]` |
| Kafka | acks=0 | `[____]` | `[____]` | `[____]` |
| Kafka | acks=1 | `[____]` | `[____]` | `[____]` |
| Kafka | acks=all | `[____]` | `[____]` | `[____]` |

### Zbirna tabela (Throughput / p95 latencija / CPU / RAM)

| Broker (config) | Throughput (msg/s) | p95 latencija (ms) | CPU (%) | RAM (MB) |
|---|---|---|---|---|
| MQTT QoS 0 | `[____]` | `[____]` | `[____]` | `[____]` |
| MQTT QoS 1 | `[____]` | `[____]` | `[____]` | `[____]` |
| MQTT QoS 2 | `[____]` | `[____]` | `[____]` | `[____]` |
| Kafka acks=0 | `[____]` | `[____]` | `[____]` | `[____]` |
| Kafka acks=1 | `[____]` | `[____]` | `[____]` | `[____]` |
| Kafka acks=all | `[____]` | `[____]` | `[____]` | `[____]` |

### Scenario B — Edge Connectivity Failures
- MQTT (trajna pretplata): `[__ ponašanje pri 30s prekidu, broj re-isporučenih poruka __]`
- Kafka (offset/lag): `[__ consumer lag posle oporavka, vreme catch-up-a __]`

### Scenario C — Burst Event Load (50 → 5000 msg/s)
- Maksimalni backlog: `[____]` · Recovery time: MQTT `[____]` / Kafka `[____]`

### Scenario D — Real-Time Alerting (end-to-end latencija alarma)
| Broker | p50 (ms) | p95 (ms) |
|---|---|---|
| MQTT | `[____]` | `[____]` |
| Kafka | `[____]` | `[____]` |

## 4. Odgovori na inženjerska pitanja

**1. Zašto je MQTT idealan na edge uređajima, a neadekvatan za istorijsku analitiku velikih podataka?**

MQTT je dizajniran kao lagan pub/sub protokol nad TCP-om sa minimalnim zaglavljem (fiksni
header od 2 bajta), malim memorijskim otiskom i podrškom za nestabilne/uske veze (keep-alive,
QoS, Last Will). Broker je „prolazni“ — fokus je na isporuci poruka u realnom vremenu, ne na
skladištenju. Zbog toga je idealan za senzore i edge gateway-e. Postaje neadekvatan za
istorijsku analitiku jer broker po pravilu **ne zadržava tok poruka** (nema trajni, ponovljivo
čitljiv log sa offset-ima, particionisanja, replay-a niti horizontalne skalabilnosti potrošača);
poruke koje nisu odmah potrošene se gube (osim ograničenog reda za perzistentne sesije).
`[__ potkrepiti merenjima iz Scenarija A/B __]`

**2. Zašto Kafka dominira u data-intensive cloud sistemima i kolika je „cena“ skalabilnosti?**

Kafka je distribuirani, particionisani, replicirani **commit log**: poruke se trajno čuvaju,
mogu se ponovo čitati (replay), a particije omogućavaju horizontalno skaliranje i propusnost.
Consumer grupe i offset-i daju pouzdanu obradu „at least once“ (i „exactly once“ uz transakcije).
Cena su resursi i operativna složenost: JVM heap, page cache, disk za log segmente, kontroler
(KRaft) — što je teško opravdati na hardverski ograničenim edge serverima.
`[__ uporediti CPU/RAM footprint iz docker stats __]`

**3. Uporedna tabela performansi** — vidi sekciju 3 (popuniti merenjima).

## 5. Zaključak

`[__ Sažetak: kada birati MQTT (edge, niska latencija, ograničeni resursi) vs Kafka
(cloud, trajnost, replay, visoka propusnost); ključni trade-off latencija vs pouzdanost. __]`
