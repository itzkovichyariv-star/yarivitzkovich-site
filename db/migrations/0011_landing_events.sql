-- Landing pages, as data.
--
-- WHY A TABLE AND NOT CONTENT FILES
-- ---------------------------------
-- The rest of this site keeps content in MDX under git, and for publications
-- that is right: they are written once, reviewed, and rarely touched. An event
-- is the opposite — its details change up to the hour it happens, and the
-- person changing them is standing in front of a browser, not a terminal.
-- Routing that through git means a commit, a push, a build and a deploy for a
-- corrected start time. Here the edit lands in D1 and the page is rendered
-- from it on the next request, so a fix is live immediately.
--
-- The first landing page (/he/ma-info, the September 2026 information session)
-- is deliberately NOT migrated into this table. It is already distributed by
-- email, WhatsApp and social, and its static page must keep answering exactly
-- as it does today. New events live here; that one stays frozen.
--
-- Registrations were built keyed by `event_slug` from the start, so they need
-- no change to work per-event — event_registrations.event_slug matches
-- landing_events.slug.

CREATE TABLE IF NOT EXISTS landing_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,      -- the URL: /e/<slug>
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'closed')),

  -- What the page says.
  kicker          TEXT,                      -- "מפגש זום פתוח"
  title           TEXT NOT NULL,             -- the headline
  organisation    TEXT,                      -- "אוניברסיטת אריאל"
  department      TEXT,
  lede            TEXT,                      -- one line under the headline
  body            TEXT,                      -- the invitation itself; blank line = new paragraph
  hosts           TEXT,                      -- one per line
  footnote        TEXT,                      -- e.g. the timetable note

  -- When and where.
  starts_at_utc   TEXT,                      -- ISO instant, for the calendar file
  ends_at_utc     TEXT,
  date_label      TEXT NOT NULL,             -- frozen Hebrew text: never re-derived from
  time_label      TEXT NOT NULL,             -- the viewer's clock, so a reader abroad
  timezone_note   TEXT DEFAULT 'שעון ישראל', -- still sees the Israeli local time
  location_label  TEXT DEFAULT 'בזום',
  join_url        TEXT,                      -- Zoom link — sent ONLY to registrants

  -- Registration behaviour.
  registration_open   INTEGER NOT NULL DEFAULT 1,
  closed_message      TEXT,                  -- shown instead of the form when closed
  ask_phone           INTEGER NOT NULL DEFAULT 1,
  ask_question        INTEGER NOT NULL DEFAULT 1,
  question_label      TEXT,
  question_placeholder TEXT,

  -- Look. Defaults reproduce the Ariel campaign palette; change per event.
  theme_bg        TEXT DEFAULT '#122033',
  theme_accent    TEXT DEFAULT '#2FA0A8',
  theme_text      TEXT DEFAULT '#C1C3C6',
  logo_url        TEXT,
  og_image_url    TEXT,

  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_landing_events_status ON landing_events(status, starts_at_utc);
