-- Registrations for public information sessions (Zoom open days and the like).
--
-- Deliberately NOT folded into `subscribers`: that table is a double-opt-in
-- mailing list with its own lifecycle, and someone who signs up for one
-- meeting has not asked to join a mailing list. Keeping them apart means a
-- registration can never leak into a publication mail-out.
--
-- Lifecycle is a single step — unlike the newsletter there is no confirm
-- click. The registrant gives an address, we email the Zoom link straight
-- back, and that email IS the confirmation. Re-registering the same address
-- for the same event updates the row and re-sends the link (people lose the
-- email), which is why (event_slug, email) is UNIQUE rather than the email
-- alone: the same person may legitimately register for a later session too.

CREATE TABLE IF NOT EXISTS event_registrations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_slug      TEXT NOT NULL,               -- which session (EVENT.slug in src/data/event.js)
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,                        -- optional
  question        TEXT,                        -- optional: what they want covered in the session
  registered_at   INTEGER NOT NULL,            -- unix ts of first registration
  updated_at      INTEGER,                     -- unix ts of the most recent re-registration
  email_sent      INTEGER NOT NULL DEFAULT 0,  -- 1 once the confirmation actually left Resend
  send_count      INTEGER NOT NULL DEFAULT 0,  -- how many confirmations we've sent this row
  source          TEXT,                        -- free-form: where the link was clicked from (?from=)
  UNIQUE(event_slug, email)
);

CREATE INDEX IF NOT EXISTS idx_event_reg_event ON event_registrations(event_slug, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_reg_email ON event_registrations(email);
