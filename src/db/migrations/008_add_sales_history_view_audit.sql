-- MIGRACIÓN 008: Agregar Audit Code SALES_HISTORY_VIEW
-- Autor: Database Administrator

INSERT INTO audit_action_catalog (code, category, severity, description, requires_justification, retention_days)
VALUES (
    'SALES_HISTORY_VIEW', 
    'OPERATIONAL', 
    'LOW', 
    'Visualización del historial de ventas', 
    FALSE, 
    365
) 
ON CONFLICT (code) DO NOTHING;
