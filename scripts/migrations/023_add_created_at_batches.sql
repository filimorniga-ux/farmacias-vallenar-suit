-- Migration: Add created_at to inventory_batches
-- Description: Adds created_at timestamp to track when stock was added (distinct from updated_at which changes on sales)

ALTER TABLE inventory_batches 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Backfill created_at with updated_at if available, or NOW()
-- Assuming updated_at exists (it was used in code). If not, this might fail or needs check.
-- Safe fallback:
UPDATE inventory_batches SET created_at = NOW() WHERE created_at IS NULL;
