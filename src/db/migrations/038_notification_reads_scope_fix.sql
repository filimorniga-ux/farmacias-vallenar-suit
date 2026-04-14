-- ============================================================================
-- Migration 038: Notification per-user read state and scope hardening
-- Farmacias Vallenar Suit — Dashboard Shell Hardening
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_reads
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE notification_reads
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE notification_reads
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE notification_reads
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_reads_notification_user
    ON notification_reads(notification_id, user_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user_visibility
    ON notification_reads(user_id, deleted_at, read_at);

COMMENT ON TABLE notification_reads IS 'Estado de lectura/eliminación por usuario para notificaciones broadcast y directas';
COMMENT ON COLUMN notification_reads.read_at IS 'Marca de lectura individual sin mutar la notificación base';
COMMENT ON COLUMN notification_reads.deleted_at IS 'Soft-delete por usuario para ocultar notificaciones sin borrarlas globalmente';
