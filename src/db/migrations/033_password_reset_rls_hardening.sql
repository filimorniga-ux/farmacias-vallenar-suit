-- =============================================================
-- Migration 033: Password/PIN Reset RLS Hardening for Supabase
-- Objetivo:
-- 1) Habilitar RLS en public.password_resets y public.pin_resets
-- 2) Evitar exposición vía PostgREST para anon/authenticated
-- 3) Mantener operación del backend con service role
-- =============================================================

BEGIN;

ALTER TABLE IF EXISTS public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pin_resets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'password_resets')
           AND NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'password_resets'
                  AND policyname = 'password_resets_deny_anon'
            ) THEN
            CREATE POLICY password_resets_deny_anon
                ON public.password_resets
                FOR ALL
                TO anon
                USING (false)
                WITH CHECK (false);
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pin_resets')
           AND NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'pin_resets'
                  AND policyname = 'pin_resets_deny_anon'
            ) THEN
            CREATE POLICY pin_resets_deny_anon
                ON public.pin_resets
                FOR ALL
                TO anon
                USING (false)
                WITH CHECK (false);
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'password_resets')
           AND NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'password_resets'
                  AND policyname = 'password_resets_deny_authenticated'
            ) THEN
            CREATE POLICY password_resets_deny_authenticated
                ON public.password_resets
                FOR ALL
                TO authenticated
                USING (false)
                WITH CHECK (false);
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pin_resets')
           AND NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'pin_resets'
                  AND policyname = 'pin_resets_deny_authenticated'
            ) THEN
            CREATE POLICY pin_resets_deny_authenticated
                ON public.pin_resets
                FOR ALL
                TO authenticated
                USING (false)
                WITH CHECK (false);
        END IF;
    END IF;
END $$;

COMMIT;
