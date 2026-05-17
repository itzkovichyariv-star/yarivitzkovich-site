-- Daily quality-check log. One row per scheduled run of /api/qc-run.
-- Used to track the health of the events table over time and surface
-- anomalies to the owner without requiring them to query the DB manually.

CREATE TABLE IF NOT EXISTS qa_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              INTEGER NOT NULL,                          -- unix epoch (seconds) of the run
  total_events    INTEGER NOT NULL,                          -- snapshot of row count
  visits          INTEGER NOT NULL DEFAULT 0,
  downloads       INTEGER NOT NULL DEFAULT 0,
  findings_json   TEXT NOT NULL,                             -- JSON array of finding strings
  fixes_json      TEXT NOT NULL DEFAULT '[]',                -- JSON array of auto-fixes applied
  duration_ms     INTEGER NOT NULL DEFAULT 0                 -- how long the QC took
);

CREATE INDEX IF NOT EXISTS idx_qa_log_ts ON qa_log(ts DESC);
