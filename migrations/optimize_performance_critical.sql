
-- Optimización de Rendimiento Crítico para Farmacias Vallenar
-- Objetivo: Reducir latencia en Dashboard y Búsquedas

-- 1. Usuarios: Búsqueda por rol y fecha (Dashboard/Admin)
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- 2. Inventario: Búsqueda rápida por SKU y Sucursal (POS/Inventario)
-- B-Tree estándar es suficiente para alta cardinalidad como SKU
CREATE INDEX IF NOT EXISTS idx_inventory_product_location ON inventory(product_id, location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location_stock ON inventory(location_id, stock);

-- 3. Ventas: Reportes y Dashboard del día
-- Usamos idx_sales_timestamp para rangos de fecha rápidos
CREATE INDEX IF NOT EXISTS idx_sales_timestamp_brin ON sales USING BRIN(timestamp); -- Si es TimescaleDB/Hypertable
CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales(timestamp); -- Fallback/Standard PG

-- 4. Movimientos de Caja: Cierre de turnos y auditoría
CREATE INDEX IF NOT EXISTS idx_cash_movements_session_type ON cash_movements(session_id, type);

-- 5. Prescripciones/Recetas (Futuro)
-- CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_rut);
