-- Add new columns for enriched inventory data
ALTER TABLE products ADD COLUMN IF NOT EXISTS concentration TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS therapeutic_action TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS units TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS prescription_type TEXT;
