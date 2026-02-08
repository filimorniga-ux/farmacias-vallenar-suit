
-- Fix Audit Action Catalog
-- Add missing action codes for Product Deletion/Archiving

INSERT INTO audit_action_catalog (code, category, severity, description, requires_justification, retention_days)
VALUES 
    ('PRODUCT_ARCHIVED', 'INVENTORY', 'MEDIUM', 'Archivado lógico de producto por dependencias', false, 365),
    ('PRODUCT_DELETE', 'INVENTORY', 'HIGH', 'Eliminación física de producto', true, 365)
ON CONFLICT (code) DO NOTHING;

-- Verificación
SELECT code, description FROM audit_action_catalog WHERE code IN ('PRODUCT_ARCHIVED', 'PRODUCT_DELETE');
