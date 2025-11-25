-- ========================================
-- FARMACI AS VALLENAR - SCHEMA INICIAL
-- ========================================

-- LIMPIEZA SEGURA
DROP TABLE IF EXISTS ventas CASCADE;
DROP TABLE IF EXISTS lotes CASCADE;
DROP TABLE IF EXISTS productos CASCADE;

-- ========================================
-- TABLA: productos (Maestro de Productos)
-- ========================================
CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  dci VARCHAR(255), -- Principio activo (DCI)
  categoria VARCHAR(50) NOT NULL, -- 'medicamento', 'insumo_medico', etc.
  condicion_venta VARCHAR(50) DEFAULT 'LIBRE', -- 'LIBRE', 'RECETA_SIMPLE', 'RECETA_RETENIDA'
  requiere_frio BOOLEAN DEFAULT FALSE,
  comisionable BOOLEAN DEFAULT FALSE, -- Anti-Ley Canela
  precio_venta INTEGER NOT NULL, -- PVP en pesos chilenos
  costo_compra INTEGER NOT NULL, -- Costo de adquisición
  imagen_url TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- TABLA: lotes (Inventario por Lote)
-- ========================================
CREATE TABLE lotes (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  numero_lote VARCHAR(50) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  cantidad_disponible INTEGER NOT NULL DEFAULT 0,
  ubicacion_fisica VARCHAR(100), -- Ej: "A2-Cajón 3"
  estado VARCHAR(20) DEFAULT 'DISPONIBLE', -- 'DISPONIBLE', 'RESERVADO', 'CUARENTENA', 'VENCIDO'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(producto_id, numero_lote)
);

-- ========================================
-- TABLA: ventas (Registro de Transacciones)
-- ========================================
CREATE TABLE ventas (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMP DEFAULT NOW(),
  total INTEGER NOT NULL,
  metodo_pago VARCHAR(20) NOT NULL, -- 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA'
  tipo_boleta VARCHAR(20) DEFAULT 'BOLETA', -- 'BOLETA', 'FACTURA'
  items JSONB NOT NULL, -- Array de { producto_id, cantidad, precio_unitario, total }
  cliente_rut VARCHAR(12),
  tipo_receta VARCHAR(30) -- 'DIRECTA', 'SIMPLE', 'RETENIDA'
);

-- ========================================
-- DATOS SEMILLA (5 Productos Críticos)
-- ========================================

-- 1. Losartán 50mg (Hipertensión) - Medicamento de venta libre
INSERT INTO productos (nombre, dci, categoria, condicion_venta, requiere_frio, comisionable, precio_venta, costo_compra)
VALUES ('Losartán 50mg Comprimidos x30', 'Losartán', 'medicamento', 'LIBRE', FALSE, FALSE, 8990, 4500);

INSERT INTO lotes (producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica)
VALUES (1, 'LOS-2025-A', '2026-12-31', 150, 'A1-Cajón 2');

-- 2. Insulina NPH (Diabetes) - Requiere refrigeración
INSERT INTO productos (nombre, dci, categoria, condicion_venta, requiere_frio, comisionable, precio_venta, costo_compra)
VALUES ('Insulina NPH 100UI/ml 10ml', 'Insulina Humana', 'medicamento', 'RECETA_SIMPLE', TRUE, FALSE, 18990, 12000);

INSERT INTO lotes (producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica, estado)
VALUES (2, 'INS-2025-B', '2025-06-30', 45, 'Refrigerador-Bandeja 1', 'DISPONIBLE');

-- 3. Ibuprofeno 400mg (Analgésico) - Venta Libre
INSERT INTO productos (nombre, dci, categoria, condicion_venta, requiere_frio, comisionable, precio_venta, costo_compra)
VALUES ('Ibuprofeno 400mg Comprimidos x20', 'Ibuprofeno', 'medicamento', 'DIRECTA', FALSE, FALSE, 3490, 1200);

INSERT INTO lotes (producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica)
VALUES (3, 'IBU-2025-C', '2027-03-15', 320, 'B2-Cajón 1');

-- 4. Zopiclona 7.5mg (Hipnótico) - Receta Retenida
INSERT INTO productos (nombre, dci, categoria, condicion_venta, requiere_frio, comisionable, precio_venta, costo_compra)
VALUES ('Zopiclona 7.5mg Comprimidos x30', 'Zopiclona', 'medicamento', 'RECETA_RETENIDA', FALSE, FALSE, 12990, 7500);

INSERT INTO lotes (producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica)
VALUES (4, 'ZOP-2025-D', '2026-09-20', 40, 'C1-Caja Fuerte');

-- 5. Maam Crema (Belleza) - Comisionable
INSERT INTO productos (nombre, dci, categoria, condicion_venta, requiere_frio, comisionable, precio_venta, costo_compra)
VALUES ('Maam Crema Antiarrugas 50ml', NULL, 'belleza', 'LIBRE', FALSE, TRUE, 24990, 10000);

INSERT INTO lotes (producto_id, numero_lote, fecha_vencimiento, cantidad_disponible, ubicacion_fisica)
VALUES (5, 'MAAM-2025-E', '2026-11-30', 80, 'D3-Vitr ina');

-- ========================================
-- VERIFICACIÓN
-- ========================================
SELECT 'PRODUCTOS CARGADOS:' as mensaje, COUNT(*) as cantidad FROM productos;
SELECT 'LOTES CARGADOS:' as mensaje, COUNT(*) as cantidad FROM lotes;
