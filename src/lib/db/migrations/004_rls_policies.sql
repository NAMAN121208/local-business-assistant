-- 004_rls_policies.sql
-- Enables Row Level Security (RLS) on all tables to prevent public/anon read or write access
-- Service role key bypasses RLS and retains full access on the backend

ALTER TABLE IF EXISTS businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_base_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_summaries ENABLE ROW LEVEL SECURITY;

-- Revoke all direct permissions from the public anon role
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Explicitly allow service_role full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
