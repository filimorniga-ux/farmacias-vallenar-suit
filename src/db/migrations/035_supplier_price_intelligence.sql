-- Migración: Sistema de Inteligencia de Precios y Proveedores
-- Farmacias Vallenar - Comparación de costos entre proveedores + Motor de recomendaciones

-- ============================================================================
-- 1. Cotizaciones históricas de precio por proveedor
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier_product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    supplier_id UUID NOT NULL,
    unit_cost INTEGER NOT NULL,
    last_order_id UUID,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_current BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraint para evitar duplicados exactos del mismo precio
CREATE UNIQUE INDEX IF NOT EXISTS uq_spp_product_supplier_cost
    ON supplier_product_prices(product_id, supplier_id, unit_cost);

CREATE INDEX IF NOT EXISTS idx_spp_product ON supplier_product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_spp_supplier ON supplier_product_prices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_spp_current ON supplier_product_prices(product_id, is_current)
    WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_spp_last_seen ON supplier_product_prices(last_seen_at DESC);

ALTER TABLE supplier_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_spp" ON supplier_product_prices
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE supplier_product_prices IS
    'Registro histórico de precios ofrecidos por cada proveedor para cada producto';

-- ============================================================================
-- 2. Recomendaciones de acción sobre precios
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
        'LEVEL_PRICE',
        'KEEP_PRICE',
        'LOWER_PRICE',
        'RAISE_PRICE',
        'FINISH_OLD_STOCK',
        'SWITCH_SUPPLIER'
    )),
    reason TEXT NOT NULL,
    current_cost INTEGER,
    suggested_cost INTEGER,
    current_price INTEGER,
    suggested_price INTEGER,
    margin_current NUMERIC(6,2),
    margin_suggested NUMERIC(6,2),
    cheaper_supplier_id UUID,
    savings_per_unit INTEGER DEFAULT 0,
    status TEXT DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'
    )),
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    triggered_by TEXT,
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_product ON price_recommendations(product_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON price_recommendations(status)
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_pr_created ON price_recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_type ON price_recommendations(recommendation_type);

ALTER TABLE price_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_pr" ON price_recommendations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE price_recommendations IS
    'Recomendaciones inteligentes de acciones sobre precios generadas automáticamente al detectar cambios de costo';
