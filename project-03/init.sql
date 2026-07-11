-- Projekat 2 — deljeni model podataka (isti IoT domen kao Projekat 1, prošireni atributi)
-- Tabela se kreira automatski pri prvom pokretanju Postgres kontejnera.

CREATE TABLE sensor_measurements (
    id BIGSERIAL PRIMARY KEY,
    device_id        VARCHAR(32),               -- NOVO: koji simulirani uređaj / Kafka ključ (particionisanje)
    recorded_at      TIMESTAMPTZ NOT NULL,       -- = produced_at iz payload-a (trenutak generisanja na uređaju)
    received_at      TIMESTAMPTZ DEFAULT now(),  -- NOVO: trenutak upisa u bazu (analiza latencije)

    -- Energetski podaci (kW)
    overall_usage    REAL,                       -- ukupna potrošnja kuće
    solar_generation REAL,                       -- proizvodnja solarnih panela
    fridge_kw        REAL,
    furnace_kw       REAL,
    home_office_kw   REAL,

    -- Meteorološki podaci
    temperature      REAL,
    humidity         REAL,
    summary          VARCHAR(50)                 -- "Clear", "Cloudy", "Rainy", "Partly Cloudy"
);

CREATE INDEX idx_time_desc ON sensor_measurements (recorded_at DESC);
CREATE INDEX idx_device   ON sensor_measurements (device_id);
