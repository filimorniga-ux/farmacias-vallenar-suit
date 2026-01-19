-- ============================================================================
-- Migration: Create Notifications Table
-- Pharma-Synapse ERP - Notification Center
-- ============================================================================

-- Create notifications table for ERP event logging
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('HR', 'INVENTORY', 'CASH', 'WMS', 'SYSTEM')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR')),
    title TEXT NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE notifications IS 'Central notification/event log for ERP system';
COMMENT ON COLUMN notifications.type IS 'Category: HR, INVENTORY, CASH, WMS, SYSTEM';
COMMENT ON COLUMN notifications.severity IS 'Importance level: INFO, SUCCESS, WARNING, ERROR';
COMMENT ON COLUMN notifications.metadata IS 'Extended JSON data for event context';

-- Performance indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_location_id ON notifications(location_id);
CREATE INDEX IF NOT EXISTS idx_notifications_severity ON notifications(severity);

-- Composite index for common dashboard query pattern
CREATE INDEX IF NOT EXISTS idx_notifications_unread_by_location 
    ON notifications(location_id, is_read, created_at DESC) 
    WHERE is_read = false;
