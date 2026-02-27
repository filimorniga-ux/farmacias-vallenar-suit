-- =============================================================
-- Migration 031: Refunds RLS Hardening for Supabase Linter
-- Objetivo:
-- 1) Habilitar RLS en tablas de devoluciones expuestas por PostgREST
-- 2) Evitar exposición de datos sensibles (ej: session_id) por API pública
-- 3) Mantener comportamiento actual del backend (usa service role / conexión servidor)
-- =============================================================

BEGIN;

ALTER TABLE IF EXISTS public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.refund_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'refunds'
              AND policyname = 'refunds_deny_anon'
        ) THEN
            CREATE POLICY refunds_deny_anon
                ON public.refunds
                FOR ALL
                TO anon
                USING (false)
                WITH CHECK (false);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'refund_items'
              AND policyname = 'refund_items_deny_anon'
        ) THEN
            CREATE POLICY refund_items_deny_anon
                ON public.refund_items
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
        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'refunds'
              AND policyname = 'refunds_deny_authenticated'
        ) THEN
            CREATE POLICY refunds_deny_authenticated
                ON public.refunds
                FOR ALL
                TO authenticated
                USING (false)
                WITH CHECK (false);
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'refund_items'
              AND policyname = 'refund_items_deny_authenticated'
        ) THEN
            CREATE POLICY refund_items_deny_authenticated
                ON public.refund_items
                FOR ALL
                TO authenticated
                USING (false)
                WITH CHECK (false);
        END IF;
    END IF;
END $$;

COMMIT;
