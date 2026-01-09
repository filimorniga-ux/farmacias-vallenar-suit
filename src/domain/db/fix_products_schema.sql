
-- Fix missing columns in products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Ensure other commonly used columns exist just in case (based on products-v2.ts usage)
ALTER TABLE products ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deactivated_by VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;
