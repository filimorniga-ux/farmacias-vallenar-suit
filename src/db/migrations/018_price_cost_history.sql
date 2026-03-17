-- Migración: Historial de cambios de precios y costos
-- Farmacias Vallenar - Trazabilidad de costos

CREATE TABLE IF NOT EXISTS price_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  batch_id UUID,
  change_type TEXT NOT NULL CHECK (change_type IN ('COST_CHANGE', 'PRICE_CHANGE', 'PRICE_LEVELING', 'COST_GENERATED')),
  field_changed TEXT NOT NULL CHECK (field_changed IN ('cost_net', 'sale_price', 'price_sell_box', 'unit_cost')),
  old_value INTEGER NOT NULL DEFAULT 0,
  new_value INTEGER NOT NULL DEFAULT 0,
  change_percent NUMERIC(8,2) DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('RECEPTION', 'MANUAL', 'AUTO_MARGIN', 'LEVELING', 'BULK_GENERATE')),
  reference_id UUID,
  supplier_id UUID,
  location_id UUID,
  user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pch_product_id ON price_cost_history(product_id);
CREATE INDEX IF NOT EXISTS idx_pch_created_at ON price_cost_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pch_change_type ON price_cost_history(change_type);
CREATE INDEX IF NOT EXISTS idx_pch_source ON price_cost_history(source);
CREATE INDEX IF NOT EXISTS idx_pch_product_date ON price_cost_history(product_id, created_at DESC);

ALTER TABLE price_cost_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON price_cost_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE price_cost_history IS 'Registro inmutable de cambios de costos y precios para auditoría y monitoreo';
