-- Add JCR (Journal Citation Reports) columns to journal_metrics.
-- impact_factor: Clarivate Journal Impact Factor (JIF).
-- jcr_quartile:  Best quartile across all WOS subject categories (Q1–Q4).
ALTER TABLE journal_metrics ADD COLUMN impact_factor REAL;
ALTER TABLE journal_metrics ADD COLUMN jcr_quartile  TEXT;
