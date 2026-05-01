CREATE TABLE sensor_measurements (
    id BIGSERIAL PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL,

    -- Energy data
    overall_usage REAL, -- House total consumption (kW)
    solar_generation REAL,     -- Solar generation (kW)
    
    -- Individual appliance consumption (kW)
    fridge_kw REAL,
    furnace_kw REAL,       -- Furnace 1 + Furnace 2 (možeš ih sabrati u kodu)
    home_office_kw REAL,
    
    -- Meteorološki podaci (Samo najbitnije)
    temperature REAL,
    humidity REAL,
    summary VARCHAR(50) -- "Clear", "Cloudy"
);

CREATE INDEX idx_time_desc ON sensor_measurements (recorded_at DESC);