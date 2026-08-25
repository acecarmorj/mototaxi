-- Sessões online do motorista (para horas trabalhadas / R$ por hora)
CREATE TABLE IF NOT EXISTS driver_online_sessions (
  id          TEXT PRIMARY KEY,
  driver_id   TEXT NOT NULL REFERENCES drivers(id),
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_driver_sessions_driver ON driver_online_sessions(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_open ON driver_online_sessions(driver_id, ended_at);
