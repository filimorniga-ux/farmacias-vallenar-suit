-- =====================================================
-- FIX: Missing Audit Action Codes for v2 actions
-- =====================================================

INSERT INTO audit_action_catalog (code, category, severity, description) VALUES
    ('BATCH_CREATED', 'OPERATIONAL', 'MEDIUM', 'Nuevo lote creado en inventario'),
    ('STOCK_ADJUSTED', 'FINANCIAL', 'HIGH', 'Ajuste manual de stock (v2)'),
    ('STOCK_TRANSFERRED', 'FINANCIAL', 'MEDIUM', 'Transferencia entre ubicaciones'),
    ('INVENTORY_CLEARED', 'SECURITY', 'CRITICAL', 'Vaciado masivo de inventario de sucursal'),
    ('PRODUCT_CREATED', 'OPERATIONAL', 'MEDIUM', 'Producto creado en el catálogo'),
    ('PRODUCT_UPDATED', 'OPERATIONAL', 'LOW', 'Información de producto actualizada'),
    ('PRODUCT_PRICE_CHANGED', 'FINANCIAL', 'HIGH', 'Cambio de precio de producto (v2)'),
    ('PRODUCT_EXPRESS_CREATE', 'OPERATIONAL', 'MEDIUM', 'Producto creado via POS Express'),
    ('INVENTORY_FRACTIONATED', 'OPERATIONAL', 'MEDIUM', 'Caja fraccionada para venta al detal')
ON CONFLICT (code) DO UPDATE SET 
    category = EXCLUDED.category,
    severity = EXCLUDED.severity,
    description = EXCLUDED.description;
