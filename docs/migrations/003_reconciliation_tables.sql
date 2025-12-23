-- =====================================================
-- MIGRACIÓN 003: Sistema de Conciliación Financiera
-- Pharma-Synapse v3.1
-- Fecha: 2025-12-23
-- =====================================================

BEGIN;

-- =====================================================
-- PASO 1: TIPOS DE JUSTIFICACIÓN PREDEFINIDOS
-- =====================================================

CREATE TABLE IF NOT EXISTS reconciliation_reason_types (
    id VARCHAR(50) PRIMARY KEY,
    description TEXT NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'GENERAL', -- 'SHORTAGE', 'OVERAGE', 'GENERAL'
    requires_evidence BOOLEAN DEFAULT FALSE,
    requires_related_transaction BOOLEAN DEFAULT FALSE,
    max_auto_approve_amount NUMERIC(10,2) DEFAULT 0,
    is_reportable_to_sii BOOLEAN DEFAULT FALSE, -- Algunas razones afectan declaraciones
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE reconciliation_reason_types IS 'Catálogo de razones válidas para justificar diferencias en arqueos';

-- Insertar razones predefinidas
INSERT INTO reconciliation_reason_types (id, description, category, requires_evidence, max_auto_approve_amount, sort_order) VALUES
-- Faltantes comunes
('ERROR_CAMBIO', 'Error al dar cambio al cliente', 'SHORTAGE', FALSE, 5000, 10),
('VENTA_NO_REGISTRADA', 'Venta realizada sin registrar en sistema', 'SHORTAGE', TRUE, 0, 20),
('DEVOLUCION_SIN_REGISTRO', 'Devolución entregada sin registrar', 'SHORTAGE', TRUE, 0, 30),
('BILLETE_FALSO', 'Se recibió billete falso no detectado', 'SHORTAGE', TRUE, 0, 40),
('DESCUENTO_MANUAL', 'Descuento manual no registrado en sistema', 'SHORTAGE', TRUE, 10000, 50),
('ROBO_HURTO', 'Sospecha de robo o hurto (requiere investigación)', 'SHORTAGE', TRUE, 0, 60),

-- Sobrantes comunes
('VUELTO_NO_ENTREGADO', 'Vuelto no entregado al cliente', 'OVERAGE', FALSE, 5000, 110),
('COBRO_DUPLICADO', 'Se cobró dos veces al mismo cliente', 'OVERAGE', TRUE, 0, 120),
('PAGO_ANTICIPADO', 'Cliente dejó pago anticipado para receta', 'OVERAGE', FALSE, 20000, 130),
('PROPINA', 'Propina del cliente (registrar como ingreso)', 'OVERAGE', FALSE, 10000, 140),

-- Errores operativos
('FONDO_INICIAL_INCORRECTO', 'El fondo inicial declarado era incorrecto', 'GENERAL', FALSE, 10000, 200),
('ERROR_CONTEO', 'Error de conteo en arqueo (recontado)', 'GENERAL', FALSE, 5000, 210),
('MOVIMIENTO_NO_REGISTRADO', 'Ingreso/Egreso no registrado en sistema', 'GENERAL', TRUE, 0, 220),

-- Otros
('OTRO', 'Otra razón (requiere descripción detallada)', 'GENERAL', TRUE, 0, 999)
ON CONFLICT (id) DO UPDATE SET 
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    requires_evidence = EXCLUDED.requires_evidence,
    max_auto_approve_amount = EXCLUDED.max_auto_approve_amount;

-- =====================================================
-- PASO 2: TABLA PRINCIPAL DE CONCILIACIONES
-- =====================================================

CREATE TABLE IF NOT EXISTS cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vinculación a sesión de caja
    session_id VARCHAR(50) NOT NULL,
    terminal_id UUID NOT NULL,
    location_id UUID NOT NULL,
    
    -- Datos del arqueo
    opening_amount NUMERIC(15,2) NOT NULL,
    expected_closing_amount NUMERIC(15,2) NOT NULL, -- Calculado por sistema
    declared_closing_amount NUMERIC(15,2) NOT NULL, -- Declarado por cajero
    difference NUMERIC(15,2) NOT NULL, -- declared - expected (+ = sobrante, - = faltante)
    
    -- Breakdown del esperado (snapshot para auditoría)
    cash_sales_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    card_sales_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    transfer_sales_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    cash_movements_in NUMERIC(15,2) NOT NULL DEFAULT 0,
    cash_movements_out NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- Estado del proceso
    status VARCHAR(30) DEFAULT 'PENDING',
    escalation_level VARCHAR(20) DEFAULT NULL, -- 'SUPERVISOR', 'MANAGER', 'FINANCE', 'LEGAL'
    
    -- Usuarios involucrados
    cashier_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Cadena de aprobación
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    approval_level VARCHAR(20), -- 'AUTO', 'SUPERVISOR', 'MANAGER', 'FINANCE'
    
    -- Metadata
    remittance_id UUID, -- Link a remesa si se creó
    notes TEXT,
    
    CONSTRAINT chk_reconciliation_status CHECK (
        status IN ('PENDING', 'JUSTIFIED', 'APPROVED', 'ESCALATED', 'DISPUTED', 'CLOSED')
    ),
    CONSTRAINT chk_approval_level CHECK (
        approval_level IS NULL OR approval_level IN ('AUTO', 'SUPERVISOR', 'MANAGER', 'FINANCE', 'GERENTE_GENERAL')
    )
);

COMMENT ON TABLE cash_reconciliations IS 'Registro de arqueos y conciliaciones de caja';
COMMENT ON COLUMN cash_reconciliations.difference IS 'Diferencia: positivo = sobrante, negativo = faltante';
COMMENT ON COLUMN cash_reconciliations.status IS 'PENDING: sin justificar, JUSTIFIED: justificado pendiente aprobación, APPROVED: cerrado OK, ESCALATED: requiere nivel superior, DISPUTED: en investigación';

-- Índices
CREATE INDEX IF NOT EXISTS idx_reconciliations_session 
    ON cash_reconciliations(session_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status 
    ON cash_reconciliations(status, location_id) 
    WHERE status NOT IN ('CLOSED', 'APPROVED');
CREATE INDEX IF NOT EXISTS idx_reconciliations_location_date 
    ON cash_reconciliations(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliations_cashier 
    ON cash_reconciliations(cashier_id, created_at DESC);

-- =====================================================
-- PASO 3: JUSTIFICACIONES DE DIFERENCIAS
-- =====================================================

CREATE TABLE IF NOT EXISTS reconciliation_justifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id) ON DELETE CASCADE,
    
    -- Tipo y detalle
    reason_type VARCHAR(50) NOT NULL REFERENCES reconciliation_reason_types(id),
    amount NUMERIC(15,2) NOT NULL, -- Monto que justifica esta razón
    description TEXT NOT NULL,
    
    -- Vinculación opcional a transacciones específicas
    related_sale_id UUID,
    related_movement_id UUID,
    related_customer_rut VARCHAR(20),
    related_customer_name VARCHAR(255),
    
    -- Evidencia
    evidence_urls TEXT[], -- Array de URLs a fotos/documentos
    evidence_description TEXT,
    
    -- Validación automática
    is_auto_approved BOOLEAN DEFAULT FALSE,
    validation_notes TEXT,
    
    -- Metadata
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT chk_amount_nonzero CHECK (amount != 0)
);

COMMENT ON TABLE reconciliation_justifications IS 'Justificaciones individuales para cada diferencia en arqueo';

CREATE INDEX IF NOT EXISTS idx_justifications_reconciliation 
    ON reconciliation_justifications(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_justifications_type 
    ON reconciliation_justifications(reason_type);

-- =====================================================
-- PASO 4: HISTORIAL DE APROBACIONES
-- =====================================================

CREATE TABLE IF NOT EXISTS reconciliation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id) ON DELETE CASCADE,
    
    action VARCHAR(20) NOT NULL, -- 'APPROVE', 'REJECT', 'ESCALATE', 'REQUEST_INFO', 'DISPUTE'
    actor_id UUID NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    
    notes TEXT,
    previous_status VARCHAR(30) NOT NULL,
    new_status VARCHAR(30) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT chk_approval_action CHECK (
        action IN ('APPROVE', 'REJECT', 'ESCALATE', 'REQUEST_INFO', 'DISPUTE', 'CLOSE')
    )
);

COMMENT ON TABLE reconciliation_approvals IS 'Audit trail de todas las acciones sobre una conciliación';

CREATE INDEX IF NOT EXISTS idx_approvals_reconciliation 
    ON reconciliation_approvals(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_approvals_actor 
    ON reconciliation_approvals(actor_id);

-- =====================================================
-- PASO 5: UMBRALES DE TOLERANCIA POR UBICACIÓN
-- =====================================================

CREATE TABLE IF NOT EXISTS reconciliation_tolerance_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL UNIQUE,
    
    -- Umbrales de auto-aprobación (en pesos)
    auto_approve_threshold NUMERIC(10,2) DEFAULT 5000,
    supervisor_threshold NUMERIC(10,2) DEFAULT 20000,
    manager_threshold NUMERIC(10,2) DEFAULT 50000,
    finance_threshold NUMERIC(10,2) DEFAULT 100000,
    
    -- Configuración adicional
    require_evidence_above NUMERIC(10,2) DEFAULT 10000,
    max_justifications_without_evidence INTEGER DEFAULT 3,
    alert_email VARCHAR(255),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID
);

-- Configuración por defecto
INSERT INTO reconciliation_tolerance_config (location_id, auto_approve_threshold)
VALUES ('00000000-0000-0000-0000-000000000000', 5000) -- Default global
ON CONFLICT (location_id) DO NOTHING;

-- =====================================================
-- PASO 6: TABLA DE REVISIONES PENDIENTES DE USUARIO
-- =====================================================

CREATE TABLE IF NOT EXISTS user_pending_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    reason VARCHAR(50) NOT NULL, -- 'ZOMBIE_SESSION', 'LARGE_DISCREPANCY', 'SUSPICIOUS_ACTIVITY'
    session_id VARCHAR(50),
    sale_id UUID,
    reconciliation_id UUID,
    details JSONB,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED'
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, session_id)
);

COMMENT ON TABLE user_pending_reviews IS 'Cola de revisiones pendientes por usuario para supervisores';

CREATE INDEX IF NOT EXISTS idx_user_reviews_status 
    ON user_pending_reviews(status, user_id) 
    WHERE status = 'PENDING';

-- =====================================================
-- PASO 7: VISTAS ÚTILES
-- =====================================================

-- Vista de conciliaciones pendientes para dashboard
CREATE OR REPLACE VIEW v_pending_reconciliations AS
SELECT 
    r.id,
    r.session_id,
    r.difference,
    r.status,
    r.created_at,
    r.cashier_id,
    u.name as cashier_name,
    t.name as terminal_name,
    l.name as location_name,
    COALESCE(SUM(j.amount), 0) as justified_amount,
    r.difference - COALESCE(SUM(j.amount), 0) as pending_justification,
    CASE 
        WHEN ABS(r.difference) <= COALESCE(tc.auto_approve_threshold, 5000) THEN 'AUTO'
        WHEN ABS(r.difference) <= COALESCE(tc.supervisor_threshold, 20000) THEN 'SUPERVISOR'
        WHEN ABS(r.difference) <= COALESCE(tc.manager_threshold, 50000) THEN 'MANAGER'
        ELSE 'FINANCE'
    END as required_approval_level,
    EXTRACT(EPOCH FROM (NOW() - r.created_at))/3600 as hours_pending
FROM cash_reconciliations r
JOIN users u ON r.cashier_id = u.id
JOIN terminals t ON r.terminal_id = t.id
JOIN locations l ON r.location_id = l.id
LEFT JOIN reconciliation_justifications j ON r.id = j.reconciliation_id
LEFT JOIN reconciliation_tolerance_config tc ON r.location_id = tc.location_id
WHERE r.status NOT IN ('CLOSED', 'APPROVED')
GROUP BY r.id, u.name, t.name, l.name, tc.auto_approve_threshold, tc.supervisor_threshold, tc.manager_threshold;

-- Vista de historial de diferencias por cajero
CREATE OR REPLACE VIEW v_cashier_discrepancy_history AS
SELECT 
    r.cashier_id,
    u.name as cashier_name,
    COUNT(*) as total_reconciliations,
    SUM(CASE WHEN r.difference < 0 THEN 1 ELSE 0 END) as shortages_count,
    SUM(CASE WHEN r.difference > 0 THEN 1 ELSE 0 END) as overages_count,
    SUM(CASE WHEN r.difference = 0 THEN 1 ELSE 0 END) as exact_count,
    SUM(r.difference) as net_difference,
    AVG(ABS(r.difference)) as avg_absolute_difference,
    MAX(ABS(r.difference)) as max_absolute_difference,
    MIN(r.created_at) as first_reconciliation,
    MAX(r.created_at) as last_reconciliation
FROM cash_reconciliations r
JOIN users u ON r.cashier_id = u.id
GROUP BY r.cashier_id, u.name;

-- Vista de razones más frecuentes
CREATE OR REPLACE VIEW v_justification_stats AS
SELECT 
    j.reason_type,
    rt.description as reason_description,
    COUNT(*) as usage_count,
    SUM(j.amount) as total_amount,
    AVG(j.amount) as avg_amount,
    COUNT(DISTINCT j.created_by) as unique_users
FROM reconciliation_justifications j
JOIN reconciliation_reason_types rt ON j.reason_type = rt.id
WHERE j.created_at > NOW() - INTERVAL '90 days'
GROUP BY j.reason_type, rt.description
ORDER BY usage_count DESC;

-- =====================================================
-- PASO 8: FUNCIONES DE NEGOCIO
-- =====================================================

-- Función para calcular el nivel de aprobación requerido
CREATE OR REPLACE FUNCTION get_required_approval_level(
    p_location_id UUID,
    p_amount NUMERIC(15,2)
) RETURNS VARCHAR(20) AS $$
DECLARE
    v_config reconciliation_tolerance_config%ROWTYPE;
    v_abs_amount NUMERIC(15,2);
BEGIN
    v_abs_amount := ABS(p_amount);
    
    -- Obtener configuración de la ubicación o default
    SELECT * INTO v_config
    FROM reconciliation_tolerance_config
    WHERE location_id = p_location_id
       OR location_id = '00000000-0000-0000-0000-000000000000'
    ORDER BY CASE WHEN location_id = p_location_id THEN 0 ELSE 1 END
    LIMIT 1;
    
    IF v_abs_amount <= COALESCE(v_config.auto_approve_threshold, 5000) THEN
        RETURN 'AUTO';
    ELSIF v_abs_amount <= COALESCE(v_config.supervisor_threshold, 20000) THEN
        RETURN 'SUPERVISOR';
    ELSIF v_abs_amount <= COALESCE(v_config.manager_threshold, 50000) THEN
        RETURN 'MANAGER';
    ELSE
        RETURN 'FINANCE';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Función para verificar si el total justificado cubre la diferencia
CREATE OR REPLACE FUNCTION check_reconciliation_fully_justified(
    p_reconciliation_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_difference NUMERIC(15,2);
    v_justified NUMERIC(15,2);
BEGIN
    SELECT difference INTO v_difference
    FROM cash_reconciliations WHERE id = p_reconciliation_id;
    
    SELECT COALESCE(SUM(amount), 0) INTO v_justified
    FROM reconciliation_justifications WHERE reconciliation_id = p_reconciliation_id;
    
    -- Consideramos justificado si cubre al menos el 95% de la diferencia
    RETURN ABS(v_justified) >= ABS(v_difference) * 0.95;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PASO 9: TRIGGER PARA AUTO-ACTUALIZAR ESTADO
-- =====================================================

CREATE OR REPLACE FUNCTION update_reconciliation_status()
RETURNS TRIGGER AS $$
DECLARE
    v_is_justified BOOLEAN;
    v_required_level VARCHAR(20);
BEGIN
    -- Solo procesar si se agregó una justificación
    IF TG_OP = 'INSERT' THEN
        -- Verificar si está completamente justificado
        v_is_justified := check_reconciliation_fully_justified(NEW.reconciliation_id);
        
        IF v_is_justified THEN
            -- Obtener nivel requerido
            SELECT get_required_approval_level(location_id, difference)
            INTO v_required_level
            FROM cash_reconciliations WHERE id = NEW.reconciliation_id;
            
            -- Si es AUTO, aprobar automáticamente
            IF v_required_level = 'AUTO' THEN
                UPDATE cash_reconciliations
                SET status = 'APPROVED',
                    approved_at = NOW(),
                    approval_level = 'AUTO'
                WHERE id = NEW.reconciliation_id;
            ELSE
                UPDATE cash_reconciliations
                SET status = 'JUSTIFIED'
                WHERE id = NEW.reconciliation_id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_reconciliation_status
AFTER INSERT ON reconciliation_justifications
FOR EACH ROW EXECUTE FUNCTION update_reconciliation_status();

-- =====================================================
-- PASO 10: REGISTRAR MIGRACIÓN
-- =====================================================

INSERT INTO schema_migrations (version, description, checksum, applied_at)
VALUES (
    '20251223003',
    'Create financial reconciliation module',
    MD5('003_reconciliation_tables.sql'),
    NOW()
) ON CONFLICT (version) DO NOTHING;

COMMIT;
