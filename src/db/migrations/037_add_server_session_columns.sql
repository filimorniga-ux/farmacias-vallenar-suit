-- ============================================================
-- Migration: Add server-side session columns to users
-- Date: 2026-03-26
-- Fixes: auth runtime expects session_token/token_version columns
-- ============================================================

BEGIN;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS session_token TEXT,
ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS current_context_data JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_users_session_token
  ON users (session_token)
  WHERE session_token IS NOT NULL;

INSERT INTO schema_migrations (version, description, applied_at)
VALUES (
  '037',
  'Add users session_token/token_version columns for server-side auth sessions',
  NOW()
)
ON CONFLICT DO NOTHING;

COMMIT;
