-- Migration 0002 — add person_hash for cross-kind person identity.
--
-- The existing ip_hash is salted with the event kind ('visit' / 'download'),
-- so the same person visiting and then downloading produces two different
-- ip_hash values. That's correct for "did this exact event already happen"
-- dedup, but it can't answer "is this the same person as one we've seen".
--
-- person_hash is salted with neither kind nor paper_slug — so it stays
-- stable across kinds within a single UTC day, letting the HUD count a
-- download by a brand-new visitor as both a first-time visit AND a download
-- (overlap), while a person who visits AND downloads still counts as one
-- unique person.
--
-- Existing rows stay NULL (we can't recompute without the raw IP). The
-- read-side queries fall back to ip_hash when person_hash is NULL so the
-- pre-migration data still produces sensible aggregates.

ALTER TABLE events ADD COLUMN person_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_events_person_hash ON events(person_hash);

-- One-time historical backfill: synthesize a first_time visit alongside
-- each existing download event so the globe shows green arcs for direct-
-- link PDF visitors that were never recorded as visits. Without this,
-- pre-launch downloads remain orphaned (maroon arcs only).
--
-- Heuristic: we can't tell from old data whether the downloader had
-- already visited (we don't store raw IPs and the old ip_hash is salted
-- with kind, so it doesn't cross-match). We default to first_time. New
-- events going forward use the live synthesis logic in pdfs/[paper].js
-- which is more accurate (checks person_hash for prior visits today).
INSERT INTO events (
  ts, kind, visitor_class, paper_slug, paper_title, page_path,
  country, country_name, continent, continent_name, city, region,
  lat, lng, ip_hash, ua_class, is_bot
)
SELECT
  d.ts, 'visit', 'first_time', d.paper_slug, d.paper_title,
  COALESCE(d.page_path, '/pdfs/' || d.paper_slug || '.pdf'),
  d.country, d.country_name, d.continent, d.continent_name, d.city, d.region,
  d.lat, d.lng,
  d.ip_hash || '|backfill', d.ua_class, d.is_bot
FROM events d
WHERE d.kind = 'download'
  AND d.is_bot = 0
  AND NOT EXISTS (
    SELECT 1 FROM events v
    WHERE v.kind = 'visit'
      AND v.ts = d.ts
      AND COALESCE(v.paper_slug, '') = COALESCE(d.paper_slug, '')
  );
