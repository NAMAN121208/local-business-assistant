-- Migration 005: Channel Integrations (Telegram & WhatsApp support)

-- 1. Ensure channel column exists on conversations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'channel'
  ) THEN
    ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'web';
  END IF;
END $$;

-- 2. Index on customer_id and channel for fast lookup of customer's active conversation per channel
CREATE INDEX IF NOT EXISTS idx_conversations_customer_channel ON conversations(customer_id, channel);

-- 3. Idempotency table for channel webhook message deduplication
CREATE TABLE IF NOT EXISTS channel_processed_messages (
  id TEXT PRIMARY KEY, -- format: "<channel>:<messageId>"
  channel TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_processed_messages_created ON channel_processed_messages(created_at);
