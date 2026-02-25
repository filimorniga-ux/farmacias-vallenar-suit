-- =====================================================
-- MIGRACIÓN 028: Primary Keys para sales y audit_logs
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================
-- SEGURIDAD: Ambas tablas ya poseen columna "id" UUID
-- con valores 100% únicos (verificado previamente).
-- Este cambio solo "oficializa" la columna id como PK.

BEGIN;

-- 1. sales: Promover columna id existente a Primary Key
ALTER TABLE sales ADD CONSTRAINT sales_pkey PRIMARY KEY (id);

-- 2. audit_logs: Promover columna id existente a Primary Key
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

-- Registro de migración
INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '028_add_primary_keys',
    'Añade Primary Key a sales y audit_logs usando la columna id existente',
    MD5('028_add_primary_keys.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
