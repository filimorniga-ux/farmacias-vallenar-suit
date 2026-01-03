-- Migration to fix missing columns for Sales v2 and Cash Management

-- 1. Fix missing 'discount_amount' in sale_items (Required for sales saving)
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;

-- 2. Fix missing 'total_purchases' in customers (Required for loyalty points)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_purchases INTEGER DEFAULT 0;

-- 3. Fix missing 'updated_at' in inventory_batches (Required for optimistic locking/tracking)
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 4. Fix missing 'updated_at' in customers (Required for tracking updates)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE cash_register_sessions ADD COLUMN authorized_by UUID;
ALTER TABLE cash_register_sessions ADD COLUMN cash_difference NUMERIC DEFAULT 0;
