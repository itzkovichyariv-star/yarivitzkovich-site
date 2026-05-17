-- Contact-form submissions. One row per message sent through
-- /contact. Not the same as subscribers — these are one-off inquiries
-- (collaboration, speaking, PhD interest, etc.) rather than recurring
-- new-paper opt-ins.
--
-- Owner reviews them at /manage/contacts and also receives an email
-- notification at OWNER_EMAIL for each new submission.

CREATE TABLE IF NOT EXISTS contacts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           INTEGER NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  message      TEXT NOT NULL,
  country      TEXT,
  country_name TEXT,
  ip_hash      TEXT,                                          -- for very lightweight rate-limiting
  status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'read', 'archived')),
  read_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_contacts_ts     ON contacts(ts DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status, ts DESC);
