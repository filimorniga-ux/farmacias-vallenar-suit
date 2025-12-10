-- Optimización de Inventario
-- Ejecutar en base de datos PostgreSQL

-- 1. Índice para búsqueda por almacén (rápido filtrado por sucursal)
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory_batches(warehouse_id);

-- 2. Índice para búsqueda por producto (rápido join con products)
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_batches(product_id);

-- 3. Actualizar estadísticas para que el planificador use los índices
ANALYZE inventory_batches;
