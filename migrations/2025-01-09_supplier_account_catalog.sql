-- Supplier Account Documents + Supplier Catalog Files
-- Creates tables to store invoices/credit notes and supplier catalogs (PDF/Excel).

CREATE TABLE IF NOT EXISTS supplier_account_documents (
    id UUID PRIMARY KEY,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('FACTURA', 'NOTA_CREDITO')),
    invoice_number VARCHAR(60) NOT NULL,
    issue_date DATE,
    due_date DATE,
    amount NUMERIC(12, 2) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    file_name VARCHAR(255) NOT NULL,
    file_mime VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    file_data BYTEA NOT NULL,
    uploaded_by UUID,
    uploaded_by_name VARCHAR(120),
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supp_acc_docs_supplier ON supplier_account_documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supp_acc_docs_invoice ON supplier_account_documents(invoice_number);
CREATE INDEX IF NOT EXISTS idx_supp_acc_docs_uploaded ON supplier_account_documents(uploaded_at);

CREATE TABLE IF NOT EXISTS supplier_catalog_files (
    id UUID PRIMARY KEY,
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    file_name VARCHAR(255) NOT NULL,
    file_mime VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    file_data BYTEA NOT NULL,
    uploaded_by UUID,
    uploaded_by_name VARCHAR(120),
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supp_catalog_supplier ON supplier_catalog_files(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supp_catalog_uploaded ON supplier_catalog_files(uploaded_at);

-- Audit catalog entries (FK-safe)
INSERT INTO audit_action_catalog (action_code, description, is_active)
VALUES ('SUPPLIER_DOC_UPLOADED', 'Carga de documento cuenta corriente proveedor', true)
ON CONFLICT (action_code) DO NOTHING;

INSERT INTO audit_action_catalog (action_code, description, is_active)
VALUES ('SUPPLIER_CATALOG_UPLOADED', 'Carga de catálogo de productos proveedor', true)
ON CONFLICT (action_code) DO NOTHING;

INSERT INTO audit_action_catalog (action_code, description, is_active)
VALUES ('SUPPLIER_DOC_DELETED', 'Eliminación documento cuenta corriente proveedor', true)
ON CONFLICT (action_code) DO NOTHING;

INSERT INTO audit_action_catalog (action_code, description, is_active)
VALUES ('SUPPLIER_CATALOG_DELETED', 'Eliminación catálogo de productos proveedor', true)
ON CONFLICT (action_code) DO NOTHING;
