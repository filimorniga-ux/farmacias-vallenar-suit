-- =====================================================
-- MIGRACIÓN 004: Estandarización de UUIDs
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================
-- EJECUTAR EN VENTANA DE MANTENIMIENTO
-- Tiempo estimado: 5-15 minutos según volumen de datos
-- REQUIERE: Backup previo de base de datos
-- =====================================================

BEGIN;

-- =====================================================
-- PARTE 0: VERIFICACIONES PREVIAS
-- =====================================================

-- Verificar que no hay sesiones activas (opcional pero recomendado)
DO $$
DECLARE
    active_sessions INTEGER;
BEGIN
    SELECT COUNT(*) INTO active_sessions 
    FROM cash_register_sessions 
    WHERE status = 'OPEN';
    
    IF active_sessions > 0 THEN
        RAISE WARNING 'Hay % sesiones activas. Considere cerrarlas antes de migrar.', active_sessions;
        -- Descomentar para forzar error:
        -- RAISE EXCEPTION 'Migración abortada: sesiones activas detectadas';
    END IF;
END $$;

-- =====================================================
-- PARTE 1: BACKUPS DE SEGURIDAD
-- =====================================================

-- Backup de terminals
DROP TABLE IF EXISTS _backup_terminals_004;
CREATE TABLE _backup_terminals_004 AS SELECT * FROM terminals;

-- Backup de cash_register_sessions
DROP TABLE IF EXISTS _backup_cash_register_sessions_004;
CREATE TABLE _backup_cash_register_sessions_004 AS SELECT * FROM cash_register_sessions;

-- Backup de cash_movements
DROP TABLE IF EXISTS _backup_cash_movements_004;
CREATE TABLE _backup_cash_movements_004 AS SELECT * FROM cash_movements;

-- Backup de sales
DROP TABLE IF EXISTS _backup_sales_004;
CREATE TABLE _backup_sales_004 AS SELECT * FROM sales;

RAISE NOTICE 'Backups creados exitosamente';

-- =====================================================
-- PARTE 2: LIMPIEZA DE DATOS HUÉRFANOS
-- =====================================================

-- 2.1 Sesiones huérfanas (terminal_id no existe o no es UUID válido)
DELETE FROM cash_register_sessions 
WHERE terminal_id IS NULL 
   OR terminal_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

DELETE FROM cash_register_sessions
WHERE terminal_id::text NOT IN (SELECT id::text FROM terminals WHERE id IS NOT NULL);

-- 2.2 Movimientos de caja huérfanos
DELETE FROM cash_movements 
WHERE terminal_id IS NOT NULL 
  AND terminal_id::text NOT IN (SELECT id::text FROM terminals WHERE id IS NOT NULL);

DELETE FROM cash_movements
WHERE session_id IS NOT NULL
  AND session_id::text NOT IN (SELECT id::text FROM cash_register_sessions WHERE id IS NOT NULL);

-- 2.3 Ventas huérfanas (terminal_id)
UPDATE sales 
SET terminal_id = NULL 
WHERE terminal_id IS NOT NULL 
  AND terminal_id::text NOT IN (SELECT id::text FROM terminals WHERE id IS NOT NULL);

RAISE NOTICE 'Datos huérfanos limpiados';

-- =====================================================
-- PARTE 3: NORMALIZACIÓN DE IDs EN TERMINALS
-- =====================================================

-- 3.1 Si terminals.id es VARCHAR/TEXT, convertir a UUID
-- Primero verificamos el tipo actual
DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns 
    WHERE table_name = 'terminals' AND column_name = 'id';
    
    IF current_type != 'uuid' THEN
        RAISE NOTICE 'Convirtiendo terminals.id de % a UUID...', current_type;
        
        -- Generar UUIDs para IDs no válidos
        UPDATE terminals 
        SET id = gen_random_uuid()::text 
        WHERE id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
        
        -- Convertir columna
        ALTER TABLE terminals ALTER COLUMN id TYPE UUID USING id::uuid;
        
        RAISE NOTICE 'terminals.id convertido a UUID';
    ELSE
        RAISE NOTICE 'terminals.id ya es UUID, omitiendo conversión';
    END IF;
END $$;

-- 3.2 Normalizar terminals.location_id
DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns 
    WHERE table_name = 'terminals' AND column_name = 'location_id';
    
    IF current_type NOT IN ('uuid') THEN
        RAISE NOTICE 'Convirtiendo terminals.location_id de % a UUID...', current_type;
        
        -- Limpiar location_ids inválidos
        UPDATE terminals 
        SET location_id = NULL 
        WHERE location_id IS NOT NULL 
          AND location_id::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
        
        -- Convertir columna
        ALTER TABLE terminals ALTER COLUMN location_id TYPE UUID USING location_id::uuid;
        
        RAISE NOTICE 'terminals.location_id convertido a UUID';
    END IF;
END $$;

-- =====================================================
-- PARTE 4: NORMALIZACIÓN DE CASH_REGISTER_SESSIONS
-- =====================================================

DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns 
    WHERE table_name = 'cash_register_sessions' AND column_name = 'terminal_id';
    
    IF current_type != 'uuid' THEN
        -- Ya limpiamos datos inválidos arriba, ahora convertimos
        ALTER TABLE cash_register_sessions 
        ALTER COLUMN terminal_id TYPE UUID USING terminal_id::uuid;
        
        RAISE NOTICE 'cash_register_sessions.terminal_id convertido a UUID';
    END IF;
END $$;

-- =====================================================
-- PARTE 5: NORMALIZACIÓN DE CASH_MOVEMENTS
-- =====================================================

DO $$
DECLARE
    current_type TEXT;
BEGIN
    -- terminal_id
    SELECT data_type INTO current_type
    FROM information_schema.columns 
    WHERE table_name = 'cash_movements' AND column_name = 'terminal_id';
    
    IF current_type IS NOT NULL AND current_type != 'uuid' THEN
        ALTER TABLE cash_movements 
        ALTER COLUMN terminal_id TYPE UUID USING terminal_id::uuid;
        RAISE NOTICE 'cash_movements.terminal_id convertido a UUID';
    END IF;
    
    -- session_id (puede ser TEXT para IDs como SESSION-xxx)
    SELECT data_type INTO current_type
    FROM information_schema.columns 
    WHERE table_name = 'cash_movements' AND column_name = 'session_id';
    
    IF current_type IS NOT NULL AND current_type != 'uuid' THEN
        -- Primero actualizar session_ids que coincidan con formato válido
        UPDATE cash_movements 
        SET session_id = NULL 
        WHERE session_id IS NOT NULL 
          AND session_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
        
        ALTER TABLE cash_movements 
        ALTER COLUMN session_id TYPE UUID USING session_id::uuid;
        RAISE NOTICE 'cash_movements.session_id convertido a UUID';
    END IF;
END $$;

-- =====================================================
-- PARTE 6: NORMALIZACIÓN DE SALES
-- =====================================================

DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'terminal_id';
    
    IF current_type IS NOT NULL AND current_type != 'uuid' THEN
        ALTER TABLE sales 
        ALTER COLUMN terminal_id TYPE UUID USING terminal_id::uuid;
        RAISE NOTICE 'sales.terminal_id convertido a UUID';
    END IF;
    
    SELECT data_type INTO current_type
    FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'location_id';
    
    IF current_type IS NOT NULL AND current_type != 'uuid' THEN
        ALTER TABLE sales 
        ALTER COLUMN location_id TYPE UUID USING location_id::uuid;
        RAISE NOTICE 'sales.location_id convertido a UUID';
    END IF;
END $$;

-- =====================================================
-- PARTE 7: FOREIGN KEYS ESTRICTAS
-- =====================================================

-- 7.1 Eliminar FKs existentes (si las hay)
ALTER TABLE cash_register_sessions DROP CONSTRAINT IF EXISTS fk_sessions_terminal;
ALTER TABLE cash_register_sessions DROP CONSTRAINT IF EXISTS cash_register_sessions_terminal_id_fkey;
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS fk_cash_movements_terminal;
ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS fk_cash_movements_session;
ALTER TABLE terminals DROP CONSTRAINT IF EXISTS fk_terminals_location;

-- 7.2 Crear FKs nuevas y estrictas
ALTER TABLE terminals
ADD CONSTRAINT fk_terminals_location
FOREIGN KEY (location_id) REFERENCES locations(id)
ON DELETE RESTRICT;

ALTER TABLE cash_register_sessions
ADD CONSTRAINT fk_sessions_terminal
FOREIGN KEY (terminal_id) REFERENCES terminals(id)
ON DELETE RESTRICT;

ALTER TABLE cash_movements
ADD CONSTRAINT fk_cash_movements_terminal
FOREIGN KEY (terminal_id) REFERENCES terminals(id)
ON DELETE SET NULL;

ALTER TABLE cash_movements
ADD CONSTRAINT fk_cash_movements_session
FOREIGN KEY (session_id) REFERENCES cash_register_sessions(id)
ON DELETE SET NULL;

RAISE NOTICE 'Foreign Keys creadas';

-- =====================================================
-- PARTE 8: ÍNDICES OPTIMIZADOS
-- =====================================================

-- Índices para terminals
CREATE INDEX IF NOT EXISTS idx_terminals_location_uuid ON terminals(location_id);
CREATE INDEX IF NOT EXISTS idx_terminals_status_active ON terminals(status) WHERE deleted_at IS NULL;

-- Índices para sessions
CREATE INDEX IF NOT EXISTS idx_sessions_terminal_status ON cash_register_sessions(terminal_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON cash_register_sessions(user_id) WHERE status = 'OPEN';

-- Índices para sales
CREATE INDEX IF NOT EXISTS idx_sales_terminal_timestamp ON sales(terminal_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sales_location_timestamp ON sales(location_id, timestamp DESC);

RAISE NOTICE 'Índices creados';

-- =====================================================
-- PARTE 9: VALIDACIONES POST-MIGRACIÓN
-- =====================================================

DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    -- Verificar terminals.id
    SELECT COUNT(*) INTO invalid_count 
    FROM terminals 
    WHERE id IS NULL;
    
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Error: % terminals con id NULL', invalid_count;
    END IF;
    
    -- Verificar sessions.terminal_id
    SELECT COUNT(*) INTO invalid_count 
    FROM cash_register_sessions 
    WHERE terminal_id IS NULL;
    
    IF invalid_count > 0 THEN
        RAISE WARNING '% sesiones con terminal_id NULL (puede ser histórico)', invalid_count;
    END IF;
    
    -- Verificar integridad referencial
    SELECT COUNT(*) INTO invalid_count
    FROM cash_register_sessions s
    LEFT JOIN terminals t ON s.terminal_id = t.id
    WHERE s.terminal_id IS NOT NULL AND t.id IS NULL;
    
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Error: % sesiones con terminal_id huérfano', invalid_count;
    END IF;
    
    RAISE NOTICE 'Validaciones completadas exitosamente';
END $$;

-- =====================================================
-- PARTE 10: REGISTRO DE MIGRACIÓN
-- =====================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW(),
    checksum VARCHAR(64)
);

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '004_uuid_standardization',
    'Estandarización de UUIDs en terminals, sessions, movements y sales',
    MD5('004_uuid_standardization.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

-- =====================================================
-- COMMIT FINAL
-- =====================================================

COMMIT;

-- =====================================================
-- INSTRUCCIONES POST-MIGRACIÓN
-- =====================================================
-- 1. Verificar logs de la migración
-- 2. Probar apertura/cierre de terminal
-- 3. Probar creación de venta
-- 4. Verificar reportes de ventas
-- 5. Si todo OK, eliminar tablas de backup después de 7 días:
--    DROP TABLE _backup_terminals_004;
--    DROP TABLE _backup_cash_register_sessions_004;
--    DROP TABLE _backup_cash_movements_004;
--    DROP TABLE _backup_sales_004;
-- =====================================================
