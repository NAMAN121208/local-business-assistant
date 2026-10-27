-- 002_phase2_schema.sql
-- Phase 2 additions: read status, missing information tracking, changelog

ALTER TABLE IF EXISTS escalations
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS bookings
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS knowledge_base_versions
  ADD COLUMN IF NOT EXISTS missing_info JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS changelog JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
