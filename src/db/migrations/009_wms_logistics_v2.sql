-- =====================================================
-- MIGRACIÓN 009: Logística WMS V2 - Corrección de Esquema
-- =====================================================

BEGIN;

-- 1. Asegurar columnas en tabla shipments
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS notes TEXT;
-- La columna valuation ya existe como numeric según el diagnóstico, pero nos aseguramos
-- ALTER TABLE shipments ADD COLUMN IF NOT EXISTS valuation NUMERIC(15, 2) DEFAULT 0;

-- 2. Asegurar columnas en tabla stock_movements
-- referencia_id ya existe? El diagnóstico mostró reference_type pero no reference_id
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_type CHARACTER VARYING;

-- 3. Crear tabla shipment_items
CREATE TABLE IF NOT EXISTS shipment_items (
    id UUID PRIMARY KEY,
    shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
    product_id UUID,
    sku VARCHAR(50),
    name VARCHAR(255),
    quantity INTEGER NOT NULL,
    batch_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para optimización
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_batch_id ON shipment_items(batch_id);

-- Registro de migración
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW(),
    checksum VARCHAR(64)
);

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '009_wms_logistics_v2',
    'Corrección de esquema para logística: shipment_items y columnas faltantes',
    MD5('009_wms_logistics_v2.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
