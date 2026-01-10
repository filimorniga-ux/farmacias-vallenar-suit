-- Fix missing audit actions causing FK violations
INSERT INTO audit_action_catalog (code, description, category, severity)
VALUES 
    ('LOCATIONS_FETCHED', 'Obtención de lista de sucursales', 'OPERATIONAL', 'LOW'),
    ('DASHBOARD_ACCESS', 'Acceso al dashboard principal', 'OPERATIONAL', 'LOW')
ON CONFLICT (code) DO NOTHING;
