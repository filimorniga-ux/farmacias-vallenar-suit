-- ============================================================================
-- Migration 040: Formal board_notes baseline
-- Farmacias Vallenar Suit — Internal Board
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.board_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT,
    branch TEXT DEFAULT 'General',
    created_by UUID,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.board_notes
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS author_name TEXT,
    ADD COLUMN IF NOT EXISTS author_role TEXT,
    ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'General',
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_board_created_at
    ON public.board_notes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_board_notes_created_by
    ON public.board_notes (created_by);

ALTER TABLE IF EXISTS public.board_notes ENABLE ROW LEVEL SECURITY;

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
          AND tablename = 'board_notes'
          AND policyname = 'board_notes_deny_api'
    ) THEN
        EXECUTE format(
            'CREATE POLICY board_notes_deny_api ON public.board_notes FOR ALL TO %s USING (false) WITH CHECK (false)',
            api_roles
        );
    END IF;
END $$;

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '040',
    'Formal board_notes baseline',
    MD5('040_board_notes_baseline.sql')
)
ON CONFLICT (version) DO UPDATE SET
    applied_at = NOW(),
    description = EXCLUDED.description,
    checksum = EXCLUDED.checksum;

COMMIT;
