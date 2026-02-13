-- Migration: Add retail lot columns to inventory_batches
-- Description: Adds columns to track lots created from splitting boxes and link them back to the original batch.

-- 1. Add columns if they don't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_batches' AND column_name = 'is_retail_lot') THEN
        ALTER TABLE inventory_batches ADD COLUMN is_retail_lot BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_batches' AND column_name = 'original_batch_id') THEN
        ALTER TABLE inventory_batches ADD COLUMN original_batch_id UUID;
    END IF;
END $$;

-- 2. Add index for faster lookups and reporting
CREATE INDEX IF NOT EXISTS idx_inventory_batches_retail_lot ON inventory_batches(is_retail_lot) WHERE is_retail_lot = TRUE;
CREATE INDEX IF NOT EXISTS idx_inventory_batches_original_batch ON inventory_batches(original_batch_id) WHERE original_batch_id IS NOT NULL;

-- 3. Update existing records (optional, but good for consistency)
-- No changes needed for existing records as they are all full boxes by default.
