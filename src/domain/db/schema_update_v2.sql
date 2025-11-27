-- Migration: Advanced Price Structure (Cost vs Sale)
-- Author: Antigravity
-- Date: 2025-11-27

-- Add financial columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_net INTEGER DEFAULT 0;       -- Costo Compra Neto
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_percent INTEGER DEFAULT 19;    -- IVA Compra (Generalmente 19%)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_sell_box INTEGER DEFAULT 0;  -- Precio Venta Público (Caja)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_sell_unit INTEGER DEFAULT 0; -- Precio Venta x Unidad (Calculado)

-- Drop legacy price column to avoid confusion (as requested)
-- We use a safe approach: rename it first or just drop if we are sure.
-- Given this is a dev environment migration, we can drop it.
ALTER TABLE products DROP COLUMN IF EXISTS price;

-- Verify
SELECT sku, name, cost_net, price_sell_box, price_sell_unit FROM products LIMIT 5;
