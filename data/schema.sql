-- SCHEMA DE BASE DE DATOS FARMACIA VALLENAR
-- Dialecto: SQLite

-- 1. Tabla Maestra de Conocimiento (Catalogada por CENABAST/ISP)
CREATE TABLE IF NOT EXISTS CATALOGO_MAESTRO (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cenabast_id TEXT UNIQUE, -- Código del maestro
    nombre_generico TEXT NOT NULL, -- Ej: PARACETAMOL 500MG
    clasificacion TEXT, -- Ej: ANALGESICO
    descripcion TEXT,
    es_bioequivalente BOOLEAN DEFAULT 0
);

-- 2. Tabla de Sucursales (Para soporte multi-sucursal futuro)
CREATE TABLE IF NOT EXISTS SUCURSALES (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    direccion TEXT
);

-- 3. Tabla Transaccional de Inventario (Lo que realmente tenemos)
CREATE TABLE IF NOT EXISTS INVENTARIO_LOCAL (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT, -- Código de barras o interno
    nombre_comercial TEXT NOT NULL, -- Como viene en el Excel (golan)
    precio INTEGER DEFAULT 0,
    stock INTEGER DEFAULT 0,
    sucursal_id INTEGER DEFAULT 1,
    
    -- EL VÍNCULO CRÍTICO (La "Bioequivalencia Inteligente")
    -- Si este campo es NULL, es un producto "Huérfano" (solo referencia local)
    -- Si tiene valor, hereda todas las propiedades del maestro (Genericos, etc)
    maestro_id INTEGER,
    
    FOREIGN KEY(maestro_id) REFERENCES CATALOGO_MAESTRO(id),
    FOREIGN KEY(sucursal_id) REFERENCES SUCURSALES(id)
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_nombre_comercial ON INVENTARIO_LOCAL(nombre_comercial);
CREATE INDEX IF NOT EXISTS idx_maestro_id ON INVENTARIO_LOCAL(maestro_id);
