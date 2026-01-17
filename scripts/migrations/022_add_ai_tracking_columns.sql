-- Migration: Add source_system tracking
-- Description: Adds columns to track if products or stock were created by AI Parser

-- 1. Add source_system to products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS source_system VARCHAR(50) DEFAULT 'MANUAL';

-- 2. Add source_system to inventory_batches
ALTER TABLE inventory_batches 
ADD COLUMN IF NOT EXISTS source_system VARCHAR(50) DEFAULT 'MANUAL';

-- 3. Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_products_source_system ON products(source_system);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_source_system ON inventory_batches(source_system);
