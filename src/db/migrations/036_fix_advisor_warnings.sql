-- ============================================================================
-- Migration 036: Fix Supabase advisor warnings
-- Farmacias Vallenar Suit
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW(),
    checksum VARCHAR(64)
);

DROP INDEX IF EXISTS public.idx_employee_shifts_location_status;

DO $$
DECLARE
    api_roles TEXT;
    user_check_expression TEXT;
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

    user_check_expression := CASE
        WHEN to_regclass('public.users') IS NOT NULL THEN
            'EXISTS (SELECT 1 FROM public.users WHERE id::text = user_id::text)'
        ELSE
            'false'
    END;

    IF to_regclass('public.price_cost_history') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.price_cost_history ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for authenticated" ON public.price_cost_history';
        EXECUTE 'DROP POLICY IF EXISTS pch_select_authenticated ON public.price_cost_history';
        EXECUTE 'DROP POLICY IF EXISTS pch_insert_authenticated ON public.price_cost_history';
        EXECUTE 'DROP POLICY IF EXISTS pch_update_own ON public.price_cost_history';
        EXECUTE 'DROP POLICY IF EXISTS pch_deny_delete ON public.price_cost_history';

        EXECUTE format(
            'CREATE POLICY pch_select_authenticated ON public.price_cost_history FOR SELECT TO %s USING (true)',
            api_roles
        );

        EXECUTE format(
            'CREATE POLICY pch_insert_authenticated ON public.price_cost_history FOR INSERT TO %s WITH CHECK (%s)',
            api_roles,
            user_check_expression
        );

        EXECUTE format(
            'CREATE POLICY pch_update_own ON public.price_cost_history FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
            api_roles,
            user_check_expression,
            user_check_expression
        );

        EXECUTE format(
            'CREATE POLICY pch_deny_delete ON public.price_cost_history FOR DELETE TO %s USING (false)',
            api_roles
        );
    ELSE
        RAISE NOTICE 'Skipping public.price_cost_history hardening because table does not exist';
    END IF;

    IF to_regclass('public.pin_resets') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pin_resets_created_by ON public.pin_resets (created_by)';
    END IF;

    IF to_regclass('public.refunds') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_refunds_authorized_by ON public.refunds (authorized_by)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON public.refunds (user_id)';
    END IF;

    IF to_regclass('public.sales') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sales_edit_authorized_by ON public.sales (edit_authorized_by)';
    END IF;
END $$;

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '036',
    'Fix Supabase advisor warnings',
    MD5('036_fix_advisor_warnings.sql')
)
ON CONFLICT (version) DO UPDATE SET
    applied_at = NOW(),
    description = EXCLUDED.description,
    checksum = EXCLUDED.checksum;

COMMIT;
