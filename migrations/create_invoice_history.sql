-- Tabla para historial de facturas Smart Invoice
CREATE TABLE IF NOT EXISTS invoice_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(100),
    supplier_rut VARCHAR(20),
    total_amount INTEGER,
    processed_data JSONB, -- Detalles procesados y resultado de match
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_history_supplier ON invoice_history(supplier_rut);
