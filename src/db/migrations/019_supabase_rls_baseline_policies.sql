-- Migration: Ensure explicit deny policies exist for tables with RLS enabled and no policies.
-- Context:
--   In Supabase linter, "RLS Enabled No Policy" is reported as INFO.
--   The table is already protected (deny-by-default), but this migration creates
--   explicit policies for anon/authenticated to keep intent auditable and consistent.

DO $$
DECLARE
    table_row RECORD;
    policy_name TEXT;
    role_clause TEXT;
    has_anon BOOLEAN;
    has_authenticated BOOLEAN;
BEGIN
    -- Resolve API roles dynamically so migration is safe in non-Supabase environments.
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'anon') INTO has_anon;
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') INTO has_authenticated;

    role_clause := array_to_string(
        ARRAY[
            CASE WHEN has_anon THEN quote_ident('anon') END,
            CASE WHEN has_authenticated THEN quote_ident('authenticated') END
        ],
        ', '
    );

    IF role_clause IS NULL OR btrim(role_clause) = '' THEN
        role_clause := 'PUBLIC';
    END IF;

    FOR table_row IN
        SELECT
            n.nspname AS schema_name,
            c.relname AS table_name
        FROM pg_class c
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND c.relrowsecurity = TRUE
          AND NOT EXISTS (
              SELECT 1
              FROM pg_policies p
              WHERE p.schemaname = n.nspname
                AND p.tablename = c.relname
          )
        ORDER BY c.relname
    LOOP
        policy_name := format(
            'deny_api_%s_%s',
            left(table_row.table_name, 22),
            substr(md5(table_row.schema_name || '.' || table_row.table_name), 1, 8)
        );

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies p
            WHERE p.schemaname = table_row.schema_name
              AND p.tablename = table_row.table_name
              AND p.policyname = policy_name
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I.%I FOR ALL TO %s USING (false) WITH CHECK (false)',
                policy_name,
                table_row.schema_name,
                table_row.table_name,
                role_clause
            );

            RAISE NOTICE 'Created explicit deny policy "%" on %.% (roles: %)',
                policy_name,
                table_row.schema_name,
                table_row.table_name,
                role_clause;
        END IF;
    END LOOP;
END $$;
