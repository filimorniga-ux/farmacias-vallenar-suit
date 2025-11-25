-- BLOCK 1: SCHEMA (Create tables)
-- ==========================================

CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  dci VARCHAR(255),
  precio INTEGER NOT NULL,
  stock_total INTEGER DEFAULT 0,
  es_frio BOOLEAN DEFAULT FALSE,
  es_bioequivalente BOOLEAN DEFAULT FALSE,
  comisionable BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS lotes (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id),
  fecha_vencimiento DATE NOT NULL,
  cantidad INTEGER NOT NULL,
  ubicacion VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS ventas (
  id SERIAL PRIMARY KEY,
  total INTEGER NOT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metodo_pago VARCHAR(50),
  estado_sii VARCHAR(50)
);

-- BLOCK 2: SEED (Cleanup and Insert data)
-- ==========================================

-- Cleanup (Order matters: child tables first)
DELETE FROM lotes;
DELETE FROM ventas;
DELETE FROM productos;

-- Reset sequences (Optional but good for consistent IDs in dev)
ALTER SEQUENCE productos_id_seq RESTART WITH 1;
ALTER SEQUENCE lotes_id_seq RESTART WITH 1;
ALTER SEQUENCE ventas_id_seq RESTART WITH 1;

-- Insert Data
INSERT INTO productos (nombre, dci, precio, stock_total, es_frio, es_bioequivalente, comisionable) VALUES
('Paracetamol 500mg', 'Paracetamol', 1500, 100, false, true, false),
('Ibuprofeno 400mg', 'Ibuprofeno', 2000, 50, false, true, false),
('Insulina Glargina', 'Insulina', 15000, 10, true, false, false);
