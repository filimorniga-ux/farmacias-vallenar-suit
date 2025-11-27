-- Migration: Create products table for Master Data (DS 466)
-- Author: Antigravity
-- Date: 2025-11-27

DROP TABLE IF EXISTS products CASCADE;

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL, -- Nombre Comercial
    dci VARCHAR(150),           -- Principio Activo (NUEVO)
    laboratory VARCHAR(100),    -- Laboratorio (NUEVO)
    isp_register VARCHAR(50),   -- Registro ISP (NUEVO)
    format VARCHAR(50),         -- Comprimido, Jarabe (NUEVO)
    units_per_box INTEGER DEFAULT 1, -- Para precio unitario (NUEVO)
    is_bioequivalent BOOLEAN DEFAULT FALSE, -- (NUEVO)
    price INT NOT NULL,
    stock_total INT DEFAULT 0,
    es_frio BOOLEAN DEFAULT FALSE,
    comisionable BOOLEAN DEFAULT FALSE,
    stock_minimo_seguridad INT DEFAULT 10,
    condicion_venta VARCHAR(10) DEFAULT 'VD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast search
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name ON products(name);
