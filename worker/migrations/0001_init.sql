-- MVP Mototaxi: schema mínimo para corrida real entre dispositivos
CREATE TABLE IF NOT EXISTS drivers (
  id            TEXT PRIMARY KEY,
  device_id     TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  colete        TEXT NOT NULL DEFAULT '032',
  plate         TEXT DEFAULT '',
  vehicle       TEXT DEFAULT 'Moto',
  is_online     INTEGER NOT NULL DEFAULT 0,
  lat           REAL,
  lng           REAL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers(is_online);
CREATE INDEX IF NOT EXISTS idx_drivers_device ON drivers(device_id);

CREATE TABLE IF NOT EXISTS rides (
  id                  TEXT PRIMARY KEY,
  passenger_device_id TEXT NOT NULL,
  passenger_name      TEXT NOT NULL DEFAULT 'Passageiro',
  driver_id           TEXT REFERENCES drivers(id),
  status              TEXT NOT NULL DEFAULT 'searching'
                      CHECK (status IN (
                        'searching', 'accepted', 'in_progress', 'completed', 'cancelled'
                      )),
  origin_lat          REAL NOT NULL,
  origin_lng          REAL NOT NULL,
  origin_address      TEXT,
  dest_lat            REAL NOT NULL,
  dest_lng            REAL NOT NULL,
  dest_address        TEXT,
  fare_estimate       REAL DEFAULT 6.0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at         TEXT,
  completed_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_passenger ON rides(passenger_device_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id);
