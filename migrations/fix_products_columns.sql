-- Agregar columnas faltantes para el módulo de Enriquecimiento de IA y Costos

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost_net INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_bioequivalent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dci TEXT,
ADD COLUMN IF NOT EXISTS laboratory TEXT,
ADD COLUMN IF NOT EXISTS format TEXT;

-- Asegurar que es_frio tenga default false si no lo tiene
ALTER TABLE products ALTER COLUMN es_frio SET DEFAULT FALSE;
