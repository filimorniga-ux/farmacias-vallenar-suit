-- Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL, -- 'HR', 'INVENTORY', 'CASH', 'WMS', 'SYSTEM'
    severity VARCHAR(20) DEFAULT 'INFO', -- 'INFO', 'SUCCESS', 'WARNING', 'ERROR'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- Store related IDs (e.g., sale_id, employee_id)
    is_read BOOLEAN DEFAULT FALSE,
    location_id UUID, -- For location-based filtering
    user_id UUID, -- Optional: Recipient specific user (NULL = broadcaset/role based)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries by type and location
CREATE INDEX IF NOT EXISTS idx_notifications_type_location ON notifications(type, location_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
