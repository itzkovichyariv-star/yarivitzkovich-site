-- Citation cache: one row per paper slug, populated by POST /api/citations
-- (owner-only, hits Semantic Scholar). Refreshed on demand or by cron.
-- Citing-paper detail is stored as JSON; the column is never queried by
-- individual citing-paper id so a relational sub-table adds no value.

CREATE TABLE IF NOT EXISTS citation_cache (
  paper_slug          TEXT PRIMARY KEY,
  doi                 TEXT,
  semantic_scholar_id TEXT,
  citation_count      INTEGER NOT NULL DEFAULT 0,
  self_citation_count INTEGER NOT NULL DEFAULT 0,
  citing_papers_json  TEXT NOT NULL DEFAULT '[]',
  fetched_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_citation_cache_doi ON citation_cache(doi);
