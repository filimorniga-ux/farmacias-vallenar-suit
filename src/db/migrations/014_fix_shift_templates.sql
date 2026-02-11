-- Migración: 014_fix_shift_templates.sql
-- Descripción: Agrega columnas faltantes para colación y descanso en shift_templates,
--              y columna notes en time_off_requests.

-- 1. shift_templates: columnas de colación y día libre
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS break_start_time TIME;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS break_end_time TIME;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS is_rest_day BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. time_off_requests: columna notes (el backend inserta `notes` pero la tabla tiene `reason`)
ALTER TABLE time_off_requests ADD COLUMN IF NOT EXISTS notes TEXT;

-- Migrar datos existentes de reason → notes si hay
UPDATE time_off_requests SET notes = reason WHERE notes IS NULL AND reason IS NOT NULL;

-- 3. Índice para consultas de turnos por status
CREATE INDEX IF NOT EXISTS idx_employee_shifts_status ON employee_shifts(status);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_location_status ON employee_shifts(location_id, status, start_at);
