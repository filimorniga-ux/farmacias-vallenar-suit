-- SCHEMA DUMP V2.0 (Reconstructed from SQLAlchemy Models)
-- Table: productos

CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    sku VARCHAR,
    nombre_comercial VARCHAR,
    precio INTEGER,
    stock INTEGER,
    nombre_normalizado VARCHAR,
    principio_activo VARCHAR,
    categoria VARCHAR,
    isp_id VARCHAR,
    cenabast_id VARCHAR,
    laboratorio VARCHAR,
    es_bioequivalente BOOLEAN DEFAULT FALSE,
    es_generico BOOLEAN DEFAULT FALSE
);

-- Indexes (deduced from index=True in models.py)
CREATE INDEX IF NOT EXISTS ix_productos_id ON productos (id);
CREATE INDEX IF NOT EXISTS ix_productos_sku ON productos (sku);
CREATE INDEX IF NOT EXISTS ix_productos_nombre_comercial ON productos (nombre_comercial);
CREATE INDEX IF NOT EXISTS ix_productos_principio_activo ON productos (principio_activo);
