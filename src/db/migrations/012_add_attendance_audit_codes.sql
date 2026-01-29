
-- =====================================================
-- MIGRACIÓN 012: Códigos de Auditoría de Asistencia
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================

BEGIN;

INSERT INTO audit_action_catalog (code, category, severity, description, requires_justification, retention_days) 
VALUES
    ('ATTENDANCE_CHECK_IN', 'OPERATIONAL', 'LOW', 'Entrada de turno', false, 365),
    ('ATTENDANCE_CHECK_OUT', 'OPERATIONAL', 'LOW', 'Salida de turno', false, 365),
    ('ATTENDANCE_BREAK_START', 'OPERATIONAL', 'LOW', 'Inicio de colación', false, 365),
    ('ATTENDANCE_BREAK_END', 'OPERATIONAL', 'LOW', 'Fin de colación', false, 365),
    ('ATTENDANCE_PERMISSION_START', 'OPERATIONAL', 'MEDIUM', 'Inicio de permiso personal', false, 365),
    ('ATTENDANCE_PERMISSION_END', 'OPERATIONAL', 'MEDIUM', 'Fin de permiso personal', false, 365),
    ('ATTENDANCE_MEDICAL_LEAVE', 'OPERATIONAL', 'MEDIUM', 'Salida por trámite médico', false, 365),
    ('ATTENDANCE_EMERGENCY', 'OPERATIONAL', 'HIGH', 'Salida de emergencia', false, 365)
ON CONFLICT (code) DO NOTHING;

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '012_add_attendance_audit_codes',
    'Agrega códigos faltantes para auditoría de asistencia',
    MD5('012_add_attendance_audit_codes.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
