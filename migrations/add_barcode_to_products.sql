-- Add barcode column to products table for matching legacy inventory
ALTER TABLE productos ADD COLUMN IF NOT EXISTS barcode VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON productos(barcode);
