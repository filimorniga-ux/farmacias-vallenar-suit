-- ============================================================================
-- MIGRACIÓN: Corrección de Columnas Faltantes
-- Farmacias Vallenar - Next.js 16 Compatibility
-- Fecha: 2025-12-27
-- ==============================================================================

-- 1. Agregar columna 'tags' a tabla 'customers'
-- Esta columna almacena etiquetas personalizadas para clasificar clientes
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

COMMENT ON COLUMN customers.tags IS 'Etiquetas personalizadas para clasificar clientes (ej: VIP, Frecuente)';

-- 2. Agregar columna 'created_by' a tabla 'purchase_orders'
-- Esta columna registra quién creó la orden de compra
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS created_by VARCHAR REFERENCES users(id);

COMMENT ON COLUMN purchase_orders.created_by IS 'Usuario que creó la orden de compra';

-- 3. Crear índice para optimizar consultas de inventario por ubicación
-- Este índice acelera significativamente las búsquedas de productos por sucursal
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory_batches(location_id);

COMMENT ON INDEX idx_inventory_location IS 'Optimiza consultas de inventario filtradas por ubicación';

-- ============================================================================
-- VERIFICACIONES POST-MIGRACIÓN
-- ============================================================================

DO $$
BEGIN
    -- Verificar que las columnas nuevas existen
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customers' AND column_name = 'tags'
    ) THEN
        RAISE EXCEPTION 'La columna customers.tags no se creó correctamente';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_orders' AND column_name = 'created_by'
    ) THEN
        RAISE EXCEPTION 'La columna purchase_orders.created_by no se creó correctamente';
    END IF;

    RAISE NOTICE '✅ Migración completada exitosamente';
END $$;
