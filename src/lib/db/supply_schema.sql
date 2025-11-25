-- ========================================
-- MODULO ABASTECIMIENTO - NUEVAS TABLAS
-- ========================================

-- 1. Tabla Proveedores
CREATE TABLE IF NOT EXISTS proveedores (
    id SERIAL PRIMARY KEY,
    nombre_fantasia VARCHAR(255) NOT NULL,
    rut VARCHAR(20) NOT NULL UNIQUE,
    contacto_email VARCHAR(255),
    telefono VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla Ordenes de Compra
CREATE TABLE IF NOT EXISTS ordenes_compra (
    id SERIAL PRIMARY KEY,
    proveedor_id INTEGER REFERENCES proveedores(id),
    fecha_emision TIMESTAMP DEFAULT NOW(),
    estado VARCHAR(50) DEFAULT 'PENDIENTE', -- 'PENDIENTE', 'RECIBIDA', 'CANCELADA'
    total_estimado INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Actualización Tabla Productos (Stock Mínimo)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='productos' AND column_name='stock_minimo_seguridad') THEN
        ALTER TABLE productos ADD COLUMN stock_minimo_seguridad INTEGER DEFAULT 10;
    END IF;
END $$;

-- 4. Seed Data Proveedores
INSERT INTO proveedores (nombre_fantasia, rut, contacto_email, telefono)
VALUES 
    ('Laboratorio Chile', '76.123.456-7', 'contacto@labchile.cl', '+56 2 2345 6789'),
    ('Saval', '78.987.654-3', 'ventas@saval.cl', '+56 2 2987 6543'),
    ('Bagó', '90.123.456-8', 'pedidos@bago.cl', '+56 2 2123 4567'),
    ('Recalcine', '88.555.444-2', 'contacto@recalcine.cl', '+56 2 2555 4444')
ON CONFLICT (rut) DO NOTHING;
