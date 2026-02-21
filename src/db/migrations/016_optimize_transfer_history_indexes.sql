-- =====================================================
-- MIGRACION 016: Optimizacion historial de traspasos
-- =====================================================

-- Acelera el listado reciente de transferencias (TRANSFER_OUT)
CREATE INDEX IF NOT EXISTS idx_stock_movements_transfer_out_recent
ON stock_movements (timestamp DESC, reference_id)
WHERE reference_type = 'LOCATION_TRANSFER'
  AND movement_type = 'TRANSFER_OUT';

-- Acelera lookup de destino por referencia (TRANSFER_IN)
CREATE INDEX IF NOT EXISTS idx_stock_movements_transfer_in_reference
ON stock_movements (reference_id, location_id)
WHERE reference_type = 'LOCATION_TRANSFER'
  AND movement_type = 'TRANSFER_IN';

-- Acelera agregaciones por referencia/SKU para detalle y export
CREATE INDEX IF NOT EXISTS idx_stock_movements_transfer_ref_sku
ON stock_movements (reference_id, sku)
WHERE reference_type = 'LOCATION_TRANSFER'
  AND movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN');
