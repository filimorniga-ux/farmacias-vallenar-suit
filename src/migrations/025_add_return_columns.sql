-- Migración: 025_add_return_columns.sql
-- Objetivo: Añadir soporte para estado de condición y notas en items de envío/devolución

BEGIN;

-- 1. Añadir columna 'condition' (enum como texto por simplicidad y compatibilidad)
-- Valores esperados: 'GOOD', 'DAMAGED', 'EXPIRED', 'NEAR_EXPIRY', 'MISSING'
ALTER TABLE shipment_items 
ADD COLUMN IF NOT EXISTS condition VARCHAR(50) DEFAULT 'GOOD';

-- 2. Añadir columna 'notes' para observaciones (ej: "Caja rota",Vencido 2025")
ALTER TABLE shipment_items 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Crear índice para búsquedas por condición (útil para reportes de mermas)
CREATE INDEX IF NOT EXISTS idx_shipment_items_condition ON shipment_items(condition);

-- 4. Actualizar registros antiguos para asegurar consistencia
UPDATE shipment_items SET condition = 'GOOD' WHERE condition IS NULL;

COMMIT;
