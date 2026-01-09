
-- Insert missing Audit Action Code for Master Update
INSERT INTO audit_action_catalog (code, category, severity, description)
VALUES 
    ('PRODUCT_MASTER_UPDATE', 'OPERATIONAL', 'LOW', 'Actualización completa de producto (Maestro)')
ON CONFLICT (code) DO NOTHING;
