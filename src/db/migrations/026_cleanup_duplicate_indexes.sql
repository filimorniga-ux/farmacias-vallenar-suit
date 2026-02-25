-- =====================================================
-- MIGRACIÓN 026: Limpieza de Índices Duplicados
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================

BEGIN;

-- 1. attendance_logs: Drop idx_attendance_user_timestamp (dup of idx_attendance_user_time)
DROP INDEX IF EXISTS idx_attendance_user_timestamp;

-- 2. product_suppliers: Drop idx_ps_sku_lookup (dup of idx_product_suppliers_sku)
DROP INDEX IF EXISTS idx_ps_sku_lookup;

-- 3. quotes: Drop idx_quotes_code_unique (dup of quotes_code_key)
DROP INDEX IF EXISTS idx_quotes_code_unique;

-- Registro de migración
INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '026_cleanup_duplicate_indexes',
    'Limpieza de índices duplicados detectados por el advisor de Supabase para optimizar performance',
    MD5('026_cleanup_duplicate_indexes.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
