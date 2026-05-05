-- Live globe — initial schema (P0)
-- See docs/DESIGN_LIVE_GLOBE.md §8.2 for details.

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              INTEGER NOT NULL,                          -- unix epoch (seconds)
  kind            TEXT NOT NULL,                             -- 'visit' | 'download'
  visitor_class   TEXT NOT NULL,                             -- 'first_time' | 'returning' | 'downloader'
  paper_slug      TEXT,                                      -- NULL for non-paper page visits
  paper_title     TEXT,                                      -- denormalized for fast reads
  page_path       TEXT,                                      -- which page they hit (for visits)
  country         TEXT,                                      -- ISO-2, e.g. 'DE'
  country_name    TEXT,                                      -- 'Germany'
  continent       TEXT,                                      -- ISO continent code, e.g. 'EU'
  continent_name  TEXT,                                      -- 'Europe'
  city            TEXT,
  region          TEXT,                                      -- state / province
  lat             REAL,
  lng             REAL,
  ip_hash         TEXT NOT NULL,                             -- SHA256(ip + daily_salt + paper_slug)
  ua_class        TEXT,                                      -- 'browser' | 'bot' | 'rss' | 'other'
  is_bot          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_events_ts            ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_kind_ts       ON events(kind, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_country_ts    ON events(country, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_continent_ts  ON events(continent, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_paper_ts      ON events(paper_slug, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_iphash_kind   ON events(ip_hash, kind, paper_slug, ts DESC);

-- Site metadata: launch timestamp, daily salt, etc.
CREATE TABLE IF NOT EXISTS site_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed launch timestamp (overwritten only if not set)
INSERT OR IGNORE INTO site_meta (key, value)
VALUES ('launch_ts', CAST(strftime('%s', 'now') AS TEXT));
