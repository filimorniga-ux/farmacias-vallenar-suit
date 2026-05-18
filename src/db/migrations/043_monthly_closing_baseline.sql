-- ============================================================================
-- Migration 043: Monthly closing baseline
-- Farmacias Vallenar Suit - Finance closing schema
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW(),
    checksum VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS public.monthly_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month INT NOT NULL,
    year INT NOT NULL,
    real_cash_income NUMERIC(12, 2) DEFAULT 0,
    real_bank_income NUMERIC(12, 2) DEFAULT 0,
    total_sales_income NUMERIC(12, 2) GENERATED ALWAYS AS (real_cash_income + real_bank_income) STORED,
    fixed_expenses NUMERIC(12, 2) DEFAULT 0,
    variable_expenses NUMERIC(12, 2) DEFAULT 0,
    payroll_cost NUMERIC(12, 2) DEFAULT 0,
    social_security_cost NUMERIC(12, 2) DEFAULT 0,
    tax_cost NUMERIC(12, 2) DEFAULT 0,
    net_result NUMERIC(12, 2) GENERATED ALWAYS AS (
        (real_cash_income + real_bank_income) -
        (fixed_expenses + variable_expenses + payroll_cost + social_security_cost + tax_cost)
    ) STORED,
    status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CLOSED')),
    notes TEXT,
    closed_by UUID,
    closed_at TIMESTAMP WITHOUT TIME ZONE,
    reopen_reason TEXT,
    reopened_by UUID,
    reopened_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.monthly_closings
    ADD COLUMN IF NOT EXISTS month INT,
    ADD COLUMN IF NOT EXISTS year INT,
    ADD COLUMN IF NOT EXISTS real_cash_income NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS real_bank_income NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fixed_expenses NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS variable_expenses NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payroll_cost NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS social_security_cost NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_cost NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS closed_by UUID,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS reopen_reason TEXT,
    ADD COLUMN IF NOT EXISTS reopened_by UUID,
    ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS monthly_closings_month_year_key
    ON public.monthly_closings (month, year);

CREATE TABLE IF NOT EXISTS public.monthly_closing_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
    direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    category TEXT NOT NULL CHECK (
        category IN (
            'CASH',
            'TRANSFER_IN',
            'CARD_INSTALLMENT',
            'DAILY_EXPENSE',
            'TRANSFER_OUT',
            'PAYROLL',
            'FIXED_EXPENSE',
            'TAX',
            'OWNER_WITHDRAWAL'
        )
    ),
    description TEXT,
    reference_date DATE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    created_by UUID,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.monthly_closing_entries
    ADD COLUMN IF NOT EXISTS month INT,
    ADD COLUMN IF NOT EXISTS year INT,
    ADD COLUMN IF NOT EXISTS direction TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS reference_date DATE,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_mce_month_year
    ON public.monthly_closing_entries (year, month);

CREATE INDEX IF NOT EXISTS idx_mce_category
    ON public.monthly_closing_entries (category);

DO $$
DECLARE
    api_roles TEXT;
    target_table_name TEXT;
    target_deny_policy_name TEXT;
BEGIN
    SELECT array_to_string(
        ARRAY[
            CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN quote_ident('anon') END,
            CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN quote_ident('authenticated') END
        ],
        ', '
    ) INTO api_roles;

    IF api_roles IS NULL OR btrim(api_roles) = '' THEN
        api_roles := 'PUBLIC';
    END IF;

    FOREACH target_table_name IN ARRAY ARRAY['monthly_closings', 'monthly_closing_entries']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table_name);

        target_deny_policy_name := format('%s_deny_api', target_table_name);

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = target_table_name
              AND policyname = target_deny_policy_name
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO %s USING (false) WITH CHECK (false)',
                target_deny_policy_name,
                target_table_name,
                api_roles
            );
        END IF;
    END LOOP;
END $$;

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '043',
    'Monthly closing baseline',
    MD5('043_monthly_closing_baseline.sql')
)
ON CONFLICT (version) DO UPDATE SET
    applied_at = NOW(),
    description = EXCLUDED.description,
    checksum = EXCLUDED.checksum;

COMMIT;
