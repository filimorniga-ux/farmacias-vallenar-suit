-- Optimizations for Attendance and Cash Sessions
-- Based on analysis of slow queries in terminals-v2.ts and attendance-v2.ts

-- 1. Index for ghost cleanup and session checks (terminals-v2.ts)
-- Query: WHERE user_id = $1 AND closed_at IS NULL
CREATE INDEX IF NOT EXISTS idx_sessions_user_active_v2 ON cash_register_sessions(user_id) WHERE closed_at IS NULL;

-- 2. Index for Auto-Check-In checks (attendance-v2.ts)
-- Query: WHERE user_id = $1 AND DATE(timestamp) = CURRENT_DATE
-- Using a composite index for user and timestamp is efficient
CREATE INDEX IF NOT EXISTS idx_attendance_user_time ON attendance_logs(user_id, timestamp DESC);

-- 3. General index for closed_at if not exists (used in reporting/maintenance)
CREATE INDEX IF NOT EXISTS idx_sessions_closed_at ON cash_register_sessions(closed_at);

-- 4. Index for foreign keys to prevent locking issues
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);
