-- Migration number: 0001 	 2026-08-16T13:14:27.896Z

CREATE TABLE users (
  uid          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uid           TEXT NOT NULL REFERENCES users(uid),
  score         INTEGER NOT NULL,
  calories      REAL NOT NULL,
  duration_sec  INTEGER NOT NULL,
  week_id       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_runs_week_score ON runs (week_id, score DESC);
CREATE INDEX idx_runs_score      ON runs (score DESC);
CREATE INDEX idx_runs_uid        ON runs (uid, created_at DESC);
