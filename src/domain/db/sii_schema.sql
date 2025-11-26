-- SII Configuration (The Vault)
CREATE TABLE IF NOT EXISTS sii_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut_emisor VARCHAR(20) NOT NULL,
    razon_social VARCHAR(255) NOT NULL,
    giro VARCHAR(255) NOT NULL,
    acteco INTEGER NOT NULL,
    
    -- Security (Encrypted/Base64)
    certificado_pfx_base64 TEXT NOT NULL,
    certificado_password VARCHAR(255) NOT NULL, -- Should be encrypted at app level before insert
    fecha_vencimiento_firma DATE NOT NULL,
    
    ambiente VARCHAR(20) CHECK (ambiente IN ('CERTIFICACION', 'PRODUCCION')) DEFAULT 'CERTIFICACION',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SII CAFs (Folios)
CREATE TABLE IF NOT EXISTS sii_cafs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_dte INTEGER NOT NULL CHECK (tipo_dte IN (33, 39, 61, 56)), -- 33: Factura, 39: Boleta, 61: Nota Credito, 56: Nota Debito
    xml_content TEXT NOT NULL, -- The raw CAF XML
    rango_desde INTEGER NOT NULL,
    rango_hasta INTEGER NOT NULL,
    folios_usados INTEGER DEFAULT 0,
    fecha_carga TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active BOOLEAN DEFAULT TRUE
);

-- DTE Documents (Legal History)
CREATE TABLE IF NOT EXISTS dte_documents (
    folio INTEGER NOT NULL,
    tipo INTEGER NOT NULL,
    rut_emisor VARCHAR(20) NOT NULL,
    
    track_id VARCHAR(50), -- SII Track ID
    status VARCHAR(20) CHECK (status IN ('PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ACEPTADO_CON_REPAROS')),
    
    xml_final TEXT, -- The signed XML
    pdf_url VARCHAR(512),
    
    monto_total INTEGER NOT NULL,
    fecha_emision TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (rut_emisor, tipo, folio)
);

-- Index for fast lookup
CREATE INDEX idx_dte_status ON dte_documents(status);
CREATE INDEX idx_dte_fecha ON dte_documents(fecha_emision);
