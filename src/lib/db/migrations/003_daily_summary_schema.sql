-- 003_daily_summary_schema.sql
-- Schema for Owner Daily Summary & Analytics (Phase 3)

CREATE TABLE IF NOT EXISTS daily_summaries (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date TEXT NOT NULL, -- YYYY-MM-DD in Asia/Kolkata
  metrics JSONB NOT NULL,
  highlights TEXT NOT NULL,
  unanswered_questions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summaries_business_date ON daily_summaries(business_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_created ON daily_summaries(created_at DESC);
