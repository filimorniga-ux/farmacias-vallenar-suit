-- ============================================================================
-- Migration 039: Add smart-invoice delete audit action
-- Farmacias Vallenar Suit — Procurement Smart Invoice Observability
-- ============================================================================

BEGIN;

INSERT INTO audit_action_catalog (code, description, category, severity)
VALUES ('INVOICE_DELETED', 'Registro de parsing de factura eliminado', 'AI', 'LOW')
ON CONFLICT (code) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    severity = EXCLUDED.severity;

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '039',
    'Add smart-invoice delete audit action',
    MD5('039_invoice_deleted_audit_action.sql')
)
ON CONFLICT (version) DO UPDATE SET
    applied_at = NOW(),
    description = EXCLUDED.description,
    checksum = EXCLUDED.checksum;

COMMIT;
