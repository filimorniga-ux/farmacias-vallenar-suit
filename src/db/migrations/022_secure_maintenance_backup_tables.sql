-- Migration 022
-- Hardening de seguridad para respaldos operativos:
-- 1) Mueve tablas maintenance_backup* fuera de public (schema maintenance)
-- 2) Revoca acceso en schema/tables de maintenance para roles externos

BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename LIKE 'maintenance_backup%'
    LOOP
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA maintenance', t.tablename);
    END LOOP;
END $$;

REVOKE ALL ON SCHEMA maintenance FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA maintenance FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA maintenance FROM authenticated';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA maintenance FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA maintenance FROM authenticated';
    END IF;
END $$;

COMMIT;
