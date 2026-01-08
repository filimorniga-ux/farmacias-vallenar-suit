-- =====================================================
-- MIGRACIÓN 006: Secuencia de Cotizaciones y Mejoras
-- =====================================================

BEGIN;

-- 1. Crear secuencia para códigos consecutivos
-- Iniciamos en 1, pero podemos ajustar si hay legado.
CREATE SEQUENCE IF NOT EXISTS quotes_code_seq START 1;

-- 2. Índices para búsqueda y filtrado eficiente
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_name ON quotes(customer_name) WHERE customer_name IS NOT NULL;
-- Usar lower para búsqueda case-insensitive si se desea, pero standard es suficiente por ahora.
CREATE INDEX IF NOT EXISTS idx_quotes_code ON quotes(code);

-- 3. Registro de migración
INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '006_quotes_sequence',
    'Secuencia para códigos de cotización e índices de búsqueda',
    MD5('006_quotes_sequence.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
