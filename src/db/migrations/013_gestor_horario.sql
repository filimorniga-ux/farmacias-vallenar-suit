-- Migración: 013_gestor_horario.sql
-- Descripción: Tablas para el módulo Gestor de Horario Laboral (Scheduler)
-- FIX V2: Users usa TEXT (legacy), Locations parece usar UUID (según seed y fallo anterior).

-- 1. Plantillas de Turnos (La "Paleta")
CREATE TABLE IF NOT EXISTS shift_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    location_id UUID REFERENCES locations(id) ON DELETE CASCADE, -- Changed to UUID (Hypothesis: locations is newer/UUID)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Contratos Laborales (Reglas para alertas)
CREATE TABLE IF NOT EXISTS staff_contracts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- Keep TEXT (verified users.id is text)
    weekly_hours INTEGER NOT NULL DEFAULT 45,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Solicitudes de Tiempo Libre (Bloqueos/Alertas)
CREATE TABLE IF NOT EXISTS time_off_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Keep TEXT
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    approved_by TEXT REFERENCES users(id) ON DELETE SET NULL, -- Keep TEXT
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

-- 4. Asignación de Turnos (La Grilla Real)
CREATE TABLE IF NOT EXISTS employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Keep TEXT
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE, -- Changed to UUID
    
    start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    end_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'draft',
    is_overtime BOOLEAN DEFAULT FALSE,
    
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL, -- Keep TEXT
    shift_template_id UUID REFERENCES shift_templates(id) ON DELETE SET NULL,
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_shift_times CHECK (end_at > start_at)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_employee_shifts_user_range ON employee_shifts(user_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_employee_shifts_location_range ON employee_shifts(location_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_time_off_user_range ON time_off_requests(user_id, start_date, end_date);
