-- ========================================
-- MIGRACIÓN 001: SOPORTE MULTI-TIENDA Y KARDEX
-- ========================================

-- 1. Crear tabla de Sucursales
CREATE TABLE IF NOT EXISTS sucursales (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion TEXT,
    telefono VARCHAR(20),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Crear tabla de Bodegas (vinculada a Sucursal)
CREATE TABLE IF NOT EXISTS bodegas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE CASCADE,
    tipo VARCHAR(50) DEFAULT 'PRINCIPAL', -- 'PRINCIPAL', 'FARMACIA', 'BODEGA_CENTRAL'
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Modificar tabla Lotes para vincular a Bodega
-- Primero agregamos la columna permitiendo NULL para migrar datos existentes
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS bodega_id INTEGER REFERENCES bodegas(id);

-- 4. Modificar tabla Ventas para vincular a Sucursal
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS sucursal_id INTEGER REFERENCES sucursales(id);

-- 5. Crear tabla de Movimientos de Inventario (Kardex)
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id SERIAL PRIMARY KEY,
    fecha TIMESTAMP DEFAULT NOW(),
    tipo_movimiento VARCHAR(50) NOT NULL, -- 'ENTRADA_COMPRA', 'SALIDA_VENTA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'TRASPASO_SALIDA', 'TRASPASO_ENTRADA'
    producto_id INTEGER REFERENCES productos(id),
    lote_id INTEGER REFERENCES lotes(id),
    bodega_id INTEGER REFERENCES bodegas(id),
    cantidad INTEGER NOT NULL, -- Siempre positivo, el tipo define si suma o resta
    referencia_id INTEGER, -- ID de la venta, compra o traspaso
    observacion TEXT,
    usuario_id VARCHAR(100), -- ID del usuario que hizo el movimiento
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- DATOS SEMILLA PARA ESTRUCTURA NUEVA
-- ========================================

-- Crear Sucursal Principal por defecto
INSERT INTO sucursales (nombre, direccion, telefono)
SELECT 'Farmacia Vallenar Centro', 'Calle Principal 123', '+56912345678'
WHERE NOT EXISTS (SELECT 1 FROM sucursales WHERE nombre = 'Farmacia Vallenar Centro');

-- Crear Bodega Principal por defecto
INSERT INTO bodegas (nombre, sucursal_id, tipo)
SELECT 'Bodega Principal', id, 'PRINCIPAL'
FROM sucursales WHERE nombre = 'Farmacia Vallenar Centro'
AND NOT EXISTS (SELECT 1 FROM bodegas WHERE nombre = 'Bodega Principal');

-- Crear Bodega de Ventas (Sala)
INSERT INTO bodegas (nombre, sucursal_id, tipo)
SELECT 'Sala de Ventas', id, 'FARMACIA'
FROM sucursales WHERE nombre = 'Farmacia Vallenar Centro'
AND NOT EXISTS (SELECT 1 FROM bodegas WHERE nombre = 'Sala de Ventas');

-- Migrar Lotes existentes a la Bodega Principal (si no tienen bodega)
UPDATE lotes 
SET bodega_id = (SELECT id FROM bodegas WHERE nombre = 'Bodega Principal' LIMIT 1)
WHERE bodega_id IS NULL;

-- Hacer obligatoria la columna bodega_id después de la migración
ALTER TABLE lotes ALTER COLUMN bodega_id SET NOT NULL;
