
-- Fix Schema: Add is_active column to products table
-- Run this script to fix "column p.is_active does not exist" error

BEGIN;

-- 1. Add columns if they don't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deactivated_by VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 2. Update existing rows to be active
UPDATE products SET is_active = TRUE WHERE is_active IS NULL;

COMMIT;

-- Verification
SELECT count(*) as total_active FROM products WHERE is_active = TRUE;
