-- Fix Audit Actions
-- Agrega los codigos de accion faltantes para evitar errores de FK
-- Severidades validas: LOW, MEDIUM, HIGH, CRITICAL
-- Categorias validas: FINANCIAL, SECURITY, OPERATIONAL, COMPLIANCE, SYSTEM, AI, INVENTORY

INSERT INTO audit_action_catalog (code, description, category, severity)
VALUES 
    ('DATA_SYNC', 'Sincronización de datos maestros a terminales', 'SYSTEM', 'LOW'),
    ('CASH_MOVEMENT', 'Movimiento de caja registrado', 'FINANCIAL', 'LOW'),
    ('EXPENSE_CREATED', 'Gasto de caja registrado', 'FINANCIAL', 'MEDIUM'),
    ('MAINTENANCE_GHOST_SESSIONS', 'Cierre automático de sesiones fantasma', 'SYSTEM', 'MEDIUM'),
    ('MAINTENANCE_CLEANUP', 'Limpieza automática de datos antiguos', 'SYSTEM', 'LOW')
ON CONFLICT (code) DO NOTHING;
