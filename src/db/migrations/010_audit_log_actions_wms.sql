-- =====================================================
-- MIGRACIÓN 010: Registro de acciones WMS en Auditoría
-- =====================================================

BEGIN;

INSERT INTO audit_action_catalog (code, category, severity, description, requires_justification, retention_days) VALUES
    ('DISPATCH', 'OPERATIONAL', 'MEDIUM', 'Despacho de mercadería entre sucursales', FALSE, 2555),
    ('RECEPTION', 'OPERATIONAL', 'MEDIUM', 'Recepción de mercadería recibida', FALSE, 2555)
ON CONFLICT (code) DO UPDATE SET
    description = EXCLUDED.description;

COMMIT;
