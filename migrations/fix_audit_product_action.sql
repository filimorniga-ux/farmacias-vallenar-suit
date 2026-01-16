-- Insertar acción de auditoría faltante para creación rápida de productos
INSERT INTO audit_action_catalog (code, category, severity, description, retention_days, requires_justification)
VALUES (
    'PRODUCT_QUICK_CREATED',
    'INVENTORY',
    'LOW',
    'Creación rápida de producto desde módulo de facturas',
    365,
    false
) ON CONFLICT (code) DO NOTHING;
