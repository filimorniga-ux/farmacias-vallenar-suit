-- Migration to allow negative inventory in batches
-- This is required to support sales when physical stock arrives but hasn't been entered into the system yet.

-- 1. Drop the existing non-negative constraint if it exists
ALTER TABLE inventory_batches DROP CONSTRAINT IF EXISTS chk_inventory_quantity_non_negative;

-- 2. Ideally, we might want a warning trigger or soft check, but for now we just remove the hard block.
--    The application logic already logs a 'STOCK_CRITICAL' notification when this happens.
