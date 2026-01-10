
ALTER TABLE inventory_imports 
ADD COLUMN IF NOT EXISTS raw_active_principle VARCHAR(255),
ADD COLUMN IF NOT EXISTS raw_misc JSONB DEFAULT '{}'::jsonb;

-- Index for searching by active principle
CREATE INDEX IF NOT EXISTS idx_inventory_active_principle ON inventory_imports(raw_active_principle);
