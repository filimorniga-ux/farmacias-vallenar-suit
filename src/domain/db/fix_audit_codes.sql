
-- Insert missing Audit Action Codes for Products with correct ENUMs
INSERT INTO audit_action_catalog (code, category, severity, description)
VALUES 
    ('PRODUCT_CREATED', 'OPERATIONAL', 'LOW', 'Creación de un nuevo producto en el maestro'),
    ('PRODUCT_UPDATED', 'OPERATIONAL', 'LOW', 'Modificación de datos básicos del producto'),
    ('PRODUCT_PRICE_CHANGED', 'FINANCIAL', 'HIGH', 'Actualización de precio de venta o costo'),
    ('PRODUCT_DEACTIVATED', 'OPERATIONAL', 'HIGH', 'Desactivación/Eliminación lógica de un producto'),
    ('PRODUCT_SUPPLIER_LINKED', 'OPERATIONAL', 'LOW', 'Vinculación de producto con proveedor')
ON CONFLICT (code) DO NOTHING;
