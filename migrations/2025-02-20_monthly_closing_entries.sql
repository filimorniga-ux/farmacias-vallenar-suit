-- Monthly Closing: itemized movements (manual) + reopen metadata
-- This migration is idempotent for local/dev use.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Movements captured manually per category
CREATE TABLE IF NOT EXISTS monthly_closing_entries (
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

CREATE INDEX IF NOT EXISTS idx_mce_month_year ON monthly_closing_entries (year, month);
CREATE INDEX IF NOT EXISTS idx_mce_category ON monthly_closing_entries (category);

-- Metadata to support reopen audit trail
ALTER TABLE monthly_closings ADD COLUMN IF NOT EXISTS reopen_reason TEXT;
ALTER TABLE monthly_closings ADD COLUMN IF NOT EXISTS reopened_by UUID;
ALTER TABLE monthly_closings ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE monthly_closings ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITHOUT TIME ZONE;
