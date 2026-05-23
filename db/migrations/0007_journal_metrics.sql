-- Journal-level metrics fetched from Scimago.
-- journal_key is a normalised lowercase version of the venue name.
CREATE TABLE IF NOT EXISTS journal_metrics (
  journal_key  TEXT PRIMARY KEY,
  journal_name TEXT NOT NULL,
  sjr          REAL,
  best_quartile TEXT,
  h_index      INTEGER,
  fetched_at   INTEGER NOT NULL
);
