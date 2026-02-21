-- =====================================================
-- MIGRACION 018: Optimización lookup inventario WMS
-- =====================================================
-- Objetivo:
-- - Acelerar carga de inventario en tabs de Despacho/Transferencia.
-- - Mejorar resolución de bodegas por sucursal/ubicación.

CREATE INDEX IF NOT EXISTS idx_inventory_batches_location_stock_positive
ON inventory_batches (location_id, sku, quantity_real DESC)
WHERE quantity_real > 0;

CREATE INDEX IF NOT EXISTS idx_inventory_batches_warehouse_stock_positive
ON inventory_batches (warehouse_id, sku, quantity_real DESC)
WHERE quantity_real > 0;

CREATE INDEX IF NOT EXISTS idx_warehouses_location_lookup
ON warehouses (location_id);
