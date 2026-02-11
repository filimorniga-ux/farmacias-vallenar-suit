-- Migración: 015_shift_break_columns.sql
-- Descripción: Agregar columnas de colación a employee_shifts
--              para poder editar inicio/fin de colación por turno asignado.

-- 1. employee_shifts: columnas de colación
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS break_start_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS break_end_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0;

-- 2. Comentarios para documentar
COMMENT ON COLUMN employee_shifts.break_start_at IS 'Hora de inicio de colación (null si no aplica)';
COMMENT ON COLUMN employee_shifts.break_end_at IS 'Hora de fin de colación (null si no aplica)';
COMMENT ON COLUMN employee_shifts.break_minutes IS 'Duración total de colación en minutos';
