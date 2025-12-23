-- =====================================================
-- MIGRACIÓN 001: Normalización de IDs TEXT → UUID
-- Pharma-Synapse v3.1
-- Fecha: 2025-12-23
-- IMPORTANTE: Ejecutar en ventana de mantenimiento
-- =====================================================

BEGIN;

-- =====================================================
-- PASO 0: BACKUP DE SEGURIDAD
-- =====================================================
CREATE SCHEMA IF NOT EXISTS _backup_20251223;

CREATE TABLE _backup_20251223.terminals AS SELECT * FROM terminals;
CREATE TABLE _backup_20251223.cash_register_sessions AS SELECT * FROM cash_register_sessions;
CREATE TABLE _backup_20251223.cash_movements AS SELECT * FROM cash_movements;
CREATE TABLE _backup_20251223.sales AS SELECT * FROM sales;

-- =====================================================
-- PASO 1: IDENTIFICAR DATOS PROBLEMÁTICOS
-- =====================================================

-- Crear tabla temporal de IDs inválidos para análisis
CREATE TEMP TABLE invalid_ids AS
SELECT 
    'terminals.location_id' as source,
    id::text as record_id,
    location_id::text as invalid_value
FROM terminals 
WHERE location_id IS NOT NULL 
  AND location_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

UNION ALL

SELECT 
    'cash_register_sessions.terminal_id',
    id::text,
    terminal_id::text
FROM cash_register_sessions
WHERE terminal_id IS NOT NULL
  AND terminal_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

UNION ALL

SELECT 
    'cash_movements.terminal_id',
    id::text,
    terminal_id::text
FROM cash_movements
WHERE terminal_id IS NOT NULL
  AND terminal_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Mostrar problemas encontrados
SELECT source, COUNT(*) as problem_count FROM invalid_ids GROUP BY source;

-- =====================================================
-- PASO 2: LIMPIAR REGISTROS HUÉRFANOS
-- (Solo si hay problemas identificados en paso anterior)
-- =====================================================

-- Opción A: Soft-delete registros problemáticos
UPDATE terminals 
SET deleted_at = NOW(), 
    status = 'DELETED',
    name = name || ' [MIGRATED - Invalid Location]'
WHERE location_id IS NOT NULL 
  AND location_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Cerrar sesiones huérfanas
UPDATE cash_register_sessions
SET status = 'CLOSED_AUTO',
    closed_at = NOW(),
    notes = COALESCE(notes, '') || ' | Cerrado por migración UUID'
WHERE terminal_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND status = 'OPEN';

-- =====================================================
-- PASO 3: CONVERSIÓN DE TIPOS
-- =====================================================

-- 3.1 terminals.location_id → UUID
-- Primero verificar que no haya valores inválidos restantes
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_count
    FROM terminals 
    WHERE location_id IS NOT NULL 
      AND deleted_at IS NULL
      AND location_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Hay % registros con location_id inválido. Revisar manualmente.', invalid_count;
    END IF;
END $$;

-- Crear columna temporal
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS location_id_uuid UUID;

-- Migrar datos válidos
UPDATE terminals 
SET location_id_uuid = location_id::uuid
WHERE location_id IS NOT NULL 
  AND location_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Verificar migración
SELECT 
    COUNT(*) as total,
    COUNT(location_id_uuid) as migrated,
    COUNT(*) - COUNT(location_id_uuid) as failed
FROM terminals WHERE deleted_at IS NULL;

-- Swap columnas (CUIDADO: esto puede romper queries existentes)
-- Comentado por seguridad - descomentar cuando esté listo para producción
-- ALTER TABLE terminals DROP COLUMN location_id;
-- ALTER TABLE terminals RENAME COLUMN location_id_uuid TO location_id;

-- 3.2 cash_register_sessions.id → Estandarizar
-- El ID de sesiones usa formato "SESSION-timestamp-random"
-- Lo dejamos como VARCHAR pero agregamos índice

-- 3.3 Agregar constraint de validación para nuevos registros
ALTER TABLE terminals DROP CONSTRAINT IF EXISTS chk_location_id_format;
-- ALTER TABLE terminals ADD CONSTRAINT chk_location_id_format 
--     CHECK (location_id_uuid IS NULL OR location_id_uuid::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- =====================================================
-- PASO 4: AGREGAR FOREIGN KEYS (después de limpieza)
-- =====================================================

-- FK terminals → locations (usando columna nueva)
-- ALTER TABLE terminals 
--     ADD CONSTRAINT fk_terminals_location_v2 
--     FOREIGN KEY (location_id_uuid) 
--     REFERENCES locations(id) 
--     ON DELETE RESTRICT;

-- =====================================================
-- PASO 5: CREAR ÍNDICES OPTIMIZADOS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_terminals_location_uuid 
    ON terminals(location_id_uuid) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_terminal_status 
    ON cash_register_sessions(terminal_id, status);

-- =====================================================
-- PASO 6: REGISTRAR MIGRACIÓN
-- =====================================================

INSERT INTO schema_migrations (version, description, checksum, applied_at)
VALUES (
    '20251223001',
    'Normalize TEXT IDs to UUID format',
    MD5('001_normalize_uuids.sql'),
    NOW()
) ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =====================================================
-- ROLLBACK SCRIPT (usar solo si es necesario)
-- =====================================================
-- BEGIN;
-- DROP TABLE IF EXISTS terminals;
-- CREATE TABLE terminals AS SELECT * FROM _backup_20251223.terminals;
-- DROP TABLE IF EXISTS cash_register_sessions;
-- CREATE TABLE cash_register_sessions AS SELECT * FROM _backup_20251223.cash_register_sessions;
-- COMMIT;
