-- ============================================================================
-- Migration 042: Harden inventory WMS RLS
-- Farmacias Vallenar Suit
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW(),
    checksum VARCHAR(64)
);

DO $$
DECLARE
    api_roles TEXT;
    target_table_name TEXT;
    target_deny_policy_name TEXT;
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

    FOREACH target_table_name IN ARRAY ARRAY['shipments', 'shipment_items', 'stock_movements']
    LOOP
        IF to_regclass(format('public.%I', target_table_name)) IS NULL THEN
            RAISE NOTICE 'Skipping %.% because it does not exist', 'public', target_table_name;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table_name);

        target_deny_policy_name := format('%s_deny_api', target_table_name);

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = target_table_name
              AND policyname = target_deny_policy_name
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO %s USING (false) WITH CHECK (false)',
                target_deny_policy_name,
                target_table_name,
                api_roles
            );
        END IF;
    END LOOP;
END $$;

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '042',
    'Harden inventory WMS RLS',
    MD5('042_inventory_wms_rls_hardening.sql')
)
ON CONFLICT (version) DO UPDATE SET
    applied_at = NOW(),
    description = EXCLUDED.description,
    checksum = EXCLUDED.checksum;

COMMIT;
