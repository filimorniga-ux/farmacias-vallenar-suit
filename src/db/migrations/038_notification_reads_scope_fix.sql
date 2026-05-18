-- ============================================================================
-- Migration 038: Notification per-user read state and scope hardening
-- Farmacias Vallenar Suit — Dashboard Shell Hardening
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW(),
    checksum VARCHAR(64)
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

ALTER TABLE IF EXISTS public.notification_reads ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    api_roles TEXT;
BEGIN
    SELECT array_to_string(
        ARRAY[
            CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN quote_ident('anon') END,
            CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN quote_ident('authenticated') END
        ],
        ', '
    ) INTO api_roles;

    IF api_roles IS NULL OR btrim(api_roles) = '' THEN
        api_roles := 'PUBLIC';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'notification_reads'
          AND policyname = 'notification_reads_deny_api'
    ) THEN
        EXECUTE format(
            'CREATE POLICY notification_reads_deny_api ON public.notification_reads FOR ALL TO %s USING (false) WITH CHECK (false)',
            api_roles
        );
    END IF;
END $$;

COMMENT ON TABLE notification_reads IS 'Estado de lectura/eliminación por usuario para notificaciones broadcast y directas';
COMMENT ON COLUMN notification_reads.read_at IS 'Marca de lectura individual sin mutar la notificación base';
COMMENT ON COLUMN notification_reads.deleted_at IS 'Soft-delete por usuario para ocultar notificaciones sin borrarlas globalmente';

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '038',
    'Notification per-user read state and scope hardening',
    MD5('038_notification_reads_scope_fix.sql')
)
ON CONFLICT (version) DO UPDATE SET
    applied_at = NOW(),
    description = EXCLUDED.description,
    checksum = EXCLUDED.checksum;

COMMIT;
