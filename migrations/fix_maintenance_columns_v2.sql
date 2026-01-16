-- Add closed_by_user_id column to cash_register_sessions if it does not exist
ALTER TABLE cash_register_sessions ADD COLUMN IF NOT EXISTS closed_by_user_id UUID;

-- Create index for performance on filtering by closer (used in maintenance logs)
CREATE INDEX IF NOT EXISTS idx_sessions_closed_by ON cash_register_sessions(closed_by_user_id);
