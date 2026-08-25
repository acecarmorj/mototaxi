-- Passageiros + campos admin / corrida
CREATE TABLE IF NOT EXISTS passengers (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_passengers_device ON passengers(device_id);
CREATE INDEX IF NOT EXISTS idx_passengers_phone ON passengers(phone);

ALTER TABLE rides ADD COLUMN passenger_id TEXT;
ALTER TABLE rides ADD COLUMN passenger_phone TEXT DEFAULT '';

ALTER TABLE drivers ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0;
