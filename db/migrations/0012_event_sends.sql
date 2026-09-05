-- Who has been sent which invitation.
--
-- WHY THIS IS NOT THE SUBSCRIBER LIST
-- -----------------------------------
-- `subscribers` are people who asked to hear when a new paper is published.
-- An invitation to an MA information session is a different thing to have
-- consented to, and mailing it to that list would be using an address for
-- something its owner never agreed to. So an event mail-out goes to an
-- explicit list of recipients, typed or pasted for that event, and this table
-- records what actually went where.
--
-- WHY A ROW PER RECIPIENT AND NOT A COUNT
-- ---------------------------------------
-- notification_log records a paper campaign as one row with a sent_count, which
-- is enough when the audience is "everyone active". Here the audience is a list
-- that grows: he sends to a department on Sunday, remembers the adjunct staff on
-- Tuesday, and pastes a list that overlaps the first. A row per (event, email)
-- makes the second send skip whoever already has it, so nobody is invited twice
-- by a paste that happened to repeat them.

CREATE TABLE IF NOT EXISTS event_sends (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_slug  TEXT NOT NULL,
  email       TEXT NOT NULL,
  name        TEXT,
  ts          INTEGER NOT NULL,
  status      TEXT NOT NULL,          -- 'sent' | 'failed'
  error       TEXT,
  UNIQUE (event_slug, email)
);

CREATE INDEX IF NOT EXISTS idx_event_sends_slug ON event_sends(event_slug, ts DESC);
