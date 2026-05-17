-- Email subscribers for the new-publication notification list.
--
-- Lifecycle:
--   1. User submits email → row inserted with status = 'pending' and a
--      confirm_token they receive by email (double opt-in).
--   2. User clicks confirmation link → status flips to 'active', the
--      confirm_token is rotated to an unsubscribe_token.
--   3. User clicks unsubscribe → status flips to 'unsubscribed'. We
--      keep the row so a future re-subscribe by the same email doesn't
--      restart the double opt-in dance silently.
--
-- We never store more than the email — no IP, no user-agent, no name.
-- Tokens are opaque random hex strings (32 bytes / 64 hex chars).

CREATE TABLE IF NOT EXISTS subscribers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'active', 'unsubscribed')),
  confirm_token     TEXT,                                       -- valid only while status = 'pending'
  unsubscribe_token TEXT,                                       -- valid only while status = 'active'
  subscribed_at     INTEGER NOT NULL,                           -- unix ts when first signed up
  confirmed_at      INTEGER,                                    -- unix ts when double opt-in completed
  unsubscribed_at   INTEGER                                     -- unix ts when they opted out
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status      ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirm     ON subscribers(confirm_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe ON subscribers(unsubscribe_token);

-- One row per outbound notification campaign (per new paper). Lets us
-- track what we've already sent so re-runs don't double-email
-- everyone if the deploy webhook fires twice.
CREATE TABLE IF NOT EXISTS notification_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_slug    TEXT NOT NULL,                                   -- which publication triggered the send
  paper_title   TEXT NOT NULL,                                   -- snapshot for the campaign
  ts            INTEGER NOT NULL,                                -- when we sent
  sent_count    INTEGER NOT NULL DEFAULT 0,
  error_count   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(paper_slug)                                             -- one campaign per paper, ever
);

CREATE INDEX IF NOT EXISTS idx_notification_log_ts ON notification_log(ts DESC);
