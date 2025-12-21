-- ========================================
-- MIGRACIÓN 003: Correcciones Críticas de Integridad
-- Fecha: 2025-12-21
-- Objetivo: Resolver inconsistencias en módulo POS
-- ========================================

BEGIN;

-- ========================================
-- PARTE 1: LIMPIEZA DE DATOS HUÉRFANOS
-- ========================================

-- 1.1. Backup de datos antes de limpieza (opcional pero recomendado)
CREATE TABLE IF NOT EXISTS terminals_backup_20251221 AS
SELECT * FROM terminals;

CREATE TABLE IF NOT EXISTS cash_register_sessions_backup_20251221 AS
SELECT * FROM cash_register_sessions;

-- 1.2. Eliminar terminales sin location válida
DELETE FROM terminals 
WHERE (location_id IS NULL) 
   OR (location_id NOT IN (SELECT id FROM locations));

-- 1.3. Eliminar TODAS las sesiones huérfanas o con IDs inválidos 
-- (Necesario para poder crear la Foreign Key y convertir a UUID)

-- Primero: Si terminal_id no es un UUID válido, borrar.
DELETE FROM cash_register_sessions
WHERE terminal_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Segundo: Si terminal_id es UUID válido pero no existe en terminals.
-- Nota: Convertimos id de terminals a text para la comparación inicial antes de que ambos sean UUID
DELETE FROM cash_register_sessions
WHERE terminal_id NOT IN (SELECT id::text FROM terminals);

-- ========================================
-- PARTE 2: AJUSTES DE ESQUEMA
-- ========================================

-- 2.1. Agregar columnas faltantes si no existen
ALTER TABLE terminals 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE terminals 
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

ALTER TABLE cash_register_sessions
ADD COLUMN IF NOT EXISTS expected_closing_amount INTEGER;

ALTER TABLE cash_movements
ADD COLUMN IF NOT EXISTS terminal_id VARCHAR(50);

ALTER TABLE cash_movements
ADD COLUMN IF NOT EXISTS session_id VARCHAR(50);

-- 2.2. Estandarizar tipos de datos
-- terminals.location_id ya era UUID, nos aseguramos
-- ALTER TABLE terminals ALTER COLUMN location_id TYPE UUID USING location_id::uuid; -- Ya es UUID
ALTER TABLE terminals ALTER COLUMN current_cashier_id TYPE VARCHAR(50);

-- Convertir terminal_id de sesiones a UUID para FK
ALTER TABLE cash_register_sessions ALTER COLUMN terminal_id TYPE UUID USING terminal_id::uuid;

-- ========================================
-- PARTE 3: FOREIGN KEYS
-- ========================================

-- 3.1. Agregar FK a terminals.location_id (CRÍTICO)
-- Solo si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_terminals_location') THEN
        ALTER TABLE terminals 
        ADD CONSTRAINT fk_terminals_location 
        FOREIGN KEY (location_id) 
        REFERENCES locations(id) 
        ON DELETE RESTRICT;
    END IF;
END $$;

-- 3.2. Agregar FK a terminals.current_cashier_id
-- Asumiendo users.id es VARCHAR/TEXT (común en auth systems)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_terminals_cashier') THEN
        ALTER TABLE terminals
        ADD CONSTRAINT fk_terminals_cashier
        FOREIGN KEY (current_cashier_id)
        REFERENCES users(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- 3.3. Mejorar FK de cash_register_sessions
ALTER TABLE cash_register_sessions
DROP CONSTRAINT IF EXISTS cash_register_sessions_terminal_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_terminal') THEN
        ALTER TABLE cash_register_sessions
        ADD CONSTRAINT fk_sessions_terminal
        FOREIGN KEY (terminal_id)
        REFERENCES terminals(id)
        ON DELETE RESTRICT;
    END IF;
END $$;

-- 3.4. Agregar FKs a cash_movements
-- Primero limpiar orfanos de cash_movements si los hay
DELETE FROM cash_movements 
WHERE terminal_id IS NOT NULL AND terminal_id::uuid NOT IN (SELECT id FROM terminals);

-- Necesitamos convertir cash_movements.terminal_id a uuid tambien si vamos a hacer FK?
-- El audit dice "terminal_id VARCHAR(50)". terminals.id es UUID.
-- Postgres permite FK entre tipos compatibles si hay cast implicito? No, types must check.
-- Vamos a convertir cash_movements.terminal_id a UUID tambien.
ALTER TABLE cash_movements ALTER COLUMN terminal_id TYPE UUID USING terminal_id::uuid;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cash_movements_terminal') THEN
        ALTER TABLE cash_movements
        ADD CONSTRAINT fk_cash_movements_terminal
        FOREIGN KEY (terminal_id)
        REFERENCES terminals(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- session_id en cash_movements -> cash_register_sessions.id (TEXT)
-- Esto se mantiene en VARCHAR/TEXT.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cash_movements_session') THEN
        ALTER TABLE cash_movements
        ADD CONSTRAINT fk_cash_movements_session
        FOREIGN KEY (session_id)
        REFERENCES cash_register_sessions(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- ========================================
-- PARTE 4: CONSTRAINTS DE NEGOCIO
-- ========================================

-- 4.1. Prevenir duplicación de terminales por location
-- Primero deduplicar: Renombrar duplicados antiguos para que pase el constraint
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (
           PARTITION BY location_id, name 
           ORDER BY created_at DESC, id
         ) as rn
  FROM terminals
)
UPDATE terminals
SET name = name || ' (Dup ' || substring(id::text, 1, 4) || ')',
    status = 'CLOSED'
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

ALTER TABLE terminals 
DROP CONSTRAINT IF EXISTS unique_terminal_name_per_location;

ALTER TABLE terminals 
ADD CONSTRAINT unique_terminal_name_per_location 
UNIQUE (location_id, name) 
DEFERRABLE INITIALLY DEFERRED;

-- 4.2. Validar que solo puede haber una sesión abierta por terminal
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session_per_terminal
ON cash_register_sessions (terminal_id)
WHERE status = 'OPEN';

-- 4.3. Validar que el monto de apertura sea positivo
ALTER TABLE cash_register_sessions
DROP CONSTRAINT IF EXISTS chk_opening_amount_positive;

ALTER TABLE cash_register_sessions
ADD CONSTRAINT chk_opening_amount_positive
CHECK (opening_amount >= 0);

-- 4.4. Validar estados válidos
ALTER TABLE terminals
DROP CONSTRAINT IF EXISTS chk_terminal_status;

ALTER TABLE terminals
ADD CONSTRAINT chk_terminal_status
CHECK (status IN ('OPEN', 'CLOSED', 'MAINTENANCE', 'DELETED'));

ALTER TABLE cash_register_sessions
DROP CONSTRAINT IF EXISTS chk_session_status;

ALTER TABLE cash_register_sessions
ADD CONSTRAINT chk_session_status
CHECK (status IN ('OPEN', 'CLOSED', 'CLOSED_AUTO', 'CLOSED_FORCE'));

-- ========================================
-- PARTE 5: ÍNDICES PARA PERFORMANCE
-- ========================================

-- 5.1. Índice compuesto para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_terminals_location_status 
ON terminals(location_id, status)
WHERE deleted_at IS NULL;

-- 5.2. Índice para sesiones activas
CREATE INDEX IF NOT EXISTS idx_sessions_active
ON cash_register_sessions(terminal_id, user_id, status)
WHERE status = 'OPEN';

-- 5.3. Índice para auditoría temporal
CREATE INDEX IF NOT EXISTS idx_sessions_date_range
ON cash_register_sessions(opened_at DESC, closed_at DESC);

-- 5.4. Índice para movimientos de caja
CREATE INDEX IF NOT EXISTS idx_cash_movements_session
ON cash_movements(session_id, timestamp DESC);

-- ========================================
-- PARTE 6: TRIGGERS AUTOMÁTICOS
-- ========================================

-- 6.1. Trigger para actualizar updated_at en terminals
CREATE OR REPLACE FUNCTION update_terminal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_terminal_timestamp ON terminals;
CREATE TRIGGER trigger_update_terminal_timestamp
BEFORE UPDATE ON terminals
FOR EACH ROW
EXECUTE FUNCTION update_terminal_timestamp();

-- 6.2. Trigger para prevenir apertura de terminal ya abierto (Seguridad Extra)
CREATE OR REPLACE FUNCTION prevent_double_open()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'OPEN' AND OLD.status = 'OPEN' AND NEW.current_cashier_id IS DISTINCT FROM OLD.current_cashier_id THEN
         RAISE EXCEPTION 'Terminal ya está abierto por otro cajero. Use forceClose() si es necesario.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_double_open ON terminals;
CREATE TRIGGER trigger_prevent_double_open
BEFORE UPDATE ON terminals
FOR EACH ROW
EXECUTE FUNCTION prevent_double_open();

-- 6.3. Trigger para auto-cerrar sesiones >24h (Safety Net)
CREATE OR REPLACE FUNCTION auto_close_stale_sessions()
RETURNS void AS $$
BEGIN
    UPDATE cash_register_sessions
    SET status = 'CLOSED_AUTO',
        closed_at = NOW(),
        notes = COALESCE(notes, '') || ' | Auto-cerrado por timeout >24h'
    WHERE status = 'OPEN'
      AND opened_at < NOW() - INTERVAL '24 hours';
      
    -- También cerrar los terminales correspondientes
    UPDATE terminals t
    SET status = 'CLOSED',
        current_cashier_id = NULL
    WHERE status = 'OPEN'
      AND NOT EXISTS (
          SELECT 1 FROM cash_register_sessions s
          WHERE s.terminal_id = t.id AND s.status = 'OPEN'
      );
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- PARTE 7: VISTAS ÚTILES
-- ========================================

-- 7.1. Vista consolidada de estado de terminales
CREATE OR REPLACE VIEW v_terminals_status AS
SELECT 
    t.id AS terminal_id,
    t.name AS terminal_name,
    t.status AS terminal_status,
    l.name AS location_name,
    l.id AS location_id,
    u.name AS cashier_name,
    u.id AS cashier_id,
    s.id AS session_id,
    s.opened_at AS session_start,
    s.opening_amount,
    EXTRACT(EPOCH FROM (NOW() - s.opened_at))/3600 AS hours_open,
    t.is_active,
    t.deleted_at
FROM terminals t
LEFT JOIN locations l ON t.location_id = l.id
LEFT JOIN users u ON t.current_cashier_id = u.id
LEFT JOIN cash_register_sessions s ON (s.terminal_id = t.id AND s.status = 'OPEN')
WHERE t.deleted_at IS NULL
ORDER BY l.name, t.name;

-- 7.2. Vista de sesiones problemáticas
CREATE OR REPLACE VIEW v_zombie_sessions AS
SELECT 
    s.id,
    s.terminal_id,
    t.name AS terminal_name,
    s.user_id,
    u.name AS user_name,
    s.opened_at,
    EXTRACT(EPOCH FROM (NOW() - s.opened_at))/3600 AS hours_open,
    s.status
FROM cash_register_sessions s
JOIN terminals t ON s.terminal_id = t.id
LEFT JOIN users u ON s.user_id = u.id
WHERE s.status = 'OPEN'
  AND (s.opened_at < NOW() - INTERVAL '12 hours' OR s.opened_at IS NULL)
ORDER BY s.opened_at DESC;

-- ========================================
-- REGISTRAR MIGRACIÓN
-- ========================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(14) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW(),
    checksum VARCHAR(64)
);

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '20251221120000',
    'Fix terminals integrity: FKs, constraints, indexes, triggers',
    MD5('003_fix_terminals_integrity.sql')
) ON CONFLICT (version) DO NOTHING;

COMMIT;
