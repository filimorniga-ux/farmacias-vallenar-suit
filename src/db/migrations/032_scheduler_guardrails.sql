-- =============================================================
-- Migration 032: Scheduler Guardrails (Data Integrity + Indexes)
-- Objetivo:
-- 1) Evitar estados inválidos en turnos/ausencias
-- 2) Validar consistencia mínima de colación
-- 3) Mejorar performance de consultas semanales
-- =============================================================

BEGIN;

DO $$
BEGIN
    -- Compatibilidad con entornos donde 015_shift_break_columns.sql no se aplicó
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'employee_shifts'
          AND column_name = 'break_start_at'
    ) THEN
        ALTER TABLE public.employee_shifts
            ADD COLUMN break_start_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'employee_shifts'
          AND column_name = 'break_end_at'
    ) THEN
        ALTER TABLE public.employee_shifts
            ADD COLUMN break_end_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'employee_shifts'
          AND column_name = 'break_minutes'
    ) THEN
        ALTER TABLE public.employee_shifts
            ADD COLUMN break_minutes INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_employee_shifts_status'
          AND conrelid = 'public.employee_shifts'::regclass
    ) THEN
        ALTER TABLE public.employee_shifts
            ADD CONSTRAINT ck_employee_shifts_status
            CHECK (status IN ('draft', 'published')) NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_employee_shifts_break_minutes'
          AND conrelid = 'public.employee_shifts'::regclass
    ) THEN
        ALTER TABLE public.employee_shifts
            ADD CONSTRAINT ck_employee_shifts_break_minutes
            CHECK (break_minutes >= 0 AND break_minutes <= 180) NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_employee_shifts_break_pair'
          AND conrelid = 'public.employee_shifts'::regclass
    ) THEN
        ALTER TABLE public.employee_shifts
            ADD CONSTRAINT ck_employee_shifts_break_pair
            CHECK (
                (break_start_at IS NULL AND break_end_at IS NULL)
                OR (break_start_at IS NOT NULL AND break_end_at IS NOT NULL AND break_end_at > break_start_at)
            ) NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_time_off_requests_type'
          AND conrelid = 'public.time_off_requests'::regclass
    ) THEN
        ALTER TABLE public.time_off_requests
            ADD CONSTRAINT ck_time_off_requests_type
            CHECK (type IN ('VACATION', 'SICK_LEAVE', 'PERSONAL', 'FAMILY_EMERGENCY', 'OTHER')) NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_time_off_requests_status'
          AND conrelid = 'public.time_off_requests'::regclass
    ) THEN
        ALTER TABLE public.time_off_requests
            ADD CONSTRAINT ck_time_off_requests_status
            CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_shifts_location_status_start_at
    ON public.employee_shifts(location_id, status, start_at);

CREATE INDEX IF NOT EXISTS idx_employee_shifts_user_start_at
    ON public.employee_shifts(user_id, start_at);

CREATE INDEX IF NOT EXISTS idx_time_off_requests_status_user_range
    ON public.time_off_requests(status, user_id, start_date, end_date);

COMMIT;
