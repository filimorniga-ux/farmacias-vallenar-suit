-- =====================================================
-- MIGRACIÓN 006: Módulo de Conciliación Financiera
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================
-- Tiempo estimado: 2-3 minutos
-- No requiere ventana de mantenimiento
-- =====================================================

BEGIN;

-- =====================================================
-- PARTE 1: TABLA DE CONCILIACIONES
-- =====================================================

CREATE TABLE IF NOT EXISTS cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vinculación a sesión
    session_id UUID NOT NULL,
    terminal_id UUID NOT NULL,
    location_id UUID NOT NULL,
    
    -- Valores calculados por el sistema
    theoretical_amount NUMERIC(15,2) NOT NULL,
    opening_amount NUMERIC(15,2) NOT NULL,
    cash_sales_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    cash_movements_in NUMERIC(15,2) NOT NULL DEFAULT 0,
    cash_movements_out NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- Valores declarados por el cajero
    declared_amount NUMERIC(15,2) NOT NULL,
    
    -- Diferencia (columna generada)
    difference NUMERIC(15,2) GENERATED ALWAYS AS 
        (declared_amount - theoretical_amount) STORED,
    
    -- Tipo de diferencia (columna generada)
    difference_type VARCHAR(20) GENERATED ALWAYS AS (
        CASE 
            WHEN declared_amount - theoretical_amount > 0 THEN 'SURPLUS'
            WHEN declared_amount - theoretical_amount < 0 THEN 'SHORTAGE'
            ELSE 'BALANCED'
        END
    ) STORED,
    
    -- Detalle de conteo físico (opcional pero recomendado)
    physical_count JSONB,
    -- Ejemplo: {"bills": {"20000": 5, "10000": 3, "5000": 2, "2000": 4, "1000": 10}, 
    --           "coins": {"500": 20, "100": 15, "50": 8, "10": 12}}
    
    -- Estado y workflow
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'UNDER_INVESTIGATION')),
    
    -- Flag de justificación requerida (generada)
    requires_justification BOOLEAN GENERATED ALWAYS AS (
        ABS(declared_amount - theoretical_amount) > 500
    ) STORED,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    
    -- Aprobación
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID,
    approval_notes TEXT,
    
    -- Constraint de unicidad (solo una conciliación por sesión)
    CONSTRAINT unique_reconciliation_per_session UNIQUE (session_id)
);

-- Comentarios de documentación
COMMENT ON TABLE cash_reconciliations IS 'Registro de conciliaciones de arqueo de caja';
COMMENT ON COLUMN cash_reconciliations.theoretical_amount IS 'Monto esperado calculado: apertura + ventas_efectivo + ingresos - egresos';
COMMENT ON COLUMN cash_reconciliations.physical_count IS 'Detalle del conteo físico por denominación de billetes y monedas';
COMMENT ON COLUMN cash_reconciliations.difference IS 'Diferencia: declarado - teórico (positivo=sobrante, negativo=faltante)';

-- =====================================================
-- PARTE 2: TABLA DE JUSTIFICACIONES
-- =====================================================

CREATE TABLE IF NOT EXISTS reconciliation_justifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id) ON DELETE CASCADE,
    
    -- Tipo de justificación
    justification_type VARCHAR(50) NOT NULL CHECK (justification_type IN (
        'COUNTING_ERROR',       -- Error de conteo del cajero
        'CHANGE_GIVEN_WRONG',   -- Vuelto mal dado al cliente
        'SALE_NOT_RECORDED',    -- Venta realizada pero no registrada en sistema
        'MOVEMENT_NOT_RECORDED',-- Movimiento de caja no registrado
        'THEFT_SUSPECTED',      -- Sospecha de robo (requiere escalamiento)
        'SYSTEM_ERROR',         -- Error del sistema POS
        'COINS_STUCK',          -- Monedas atascadas en caja
        'ROUNDING',             -- Diferencia por redondeo en efectivo
        'VOID_NOT_PROCESSED',   -- Anulación no procesada correctamente
        'OTHER'                 -- Otro (requiere descripción detallada)
    )),
    
    -- Detalle obligatorio
    description TEXT NOT NULL CHECK (LENGTH(description) >= 20),
    
    -- Evidencia (URLs de fotos, documentos, etc.)
    evidence_urls TEXT[],
    
    -- Vinculación a ventas/movimientos específicos (si aplica)
    related_sale_ids UUID[],
    related_movement_ids UUID[],
    
    -- Monto justificado (puede ser parcial)
    amount_justified NUMERIC(15,2) NOT NULL,
    
    -- Creación
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    
    -- Validación por supervisor
    validated_at TIMESTAMP WITH TIME ZONE,
    validated_by UUID,
    validation_status VARCHAR(20) CHECK (validation_status IN ('ACCEPTED', 'REJECTED', 'PARTIAL')),
    validation_notes TEXT
);

COMMENT ON TABLE reconciliation_justifications IS 'Justificaciones de diferencias en conciliaciones';
COMMENT ON COLUMN reconciliation_justifications.amount_justified IS 'Monto de la diferencia que cubre esta justificación';

-- =====================================================
-- PARTE 3: TABLA DE ALERTAS DE CONCILIACIÓN
-- =====================================================

CREATE TABLE IF NOT EXISTS reconciliation_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id) ON DELETE CASCADE,
    
    -- Tipo de alerta
    alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN (
        'MINOR_SHORTAGE',       -- Faltante < $1,000
        'MAJOR_SHORTAGE',       -- Faltante $1,000 - $5,000
        'CRITICAL_SHORTAGE',    -- Faltante > $5,000
        'SUSPICIOUS_SURPLUS',   -- Sobrante significativo (posible venta no registrada)
        'PATTERN_DETECTED',     -- Patrón repetitivo detectado
        'UNJUSTIFIED',          -- Sin justificación válida pasado tiempo límite
        'ESCALATED'             -- Escalado a gerencia
    )),
    
    -- Severidad
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    
    -- Destinatarios notificados
    notified_users UUID[],
    notification_sent_at TIMESTAMP WITH TIME ZONE,
    notification_channels TEXT[], -- ['EMAIL', 'SMS', 'PUSH']
    
    -- Resolución
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED')),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID,
    resolution_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PARTE 4: TABLA DE PATRONES (Para detección de anomalías)
-- =====================================================

CREATE TABLE IF NOT EXISTS reconciliation_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_type VARCHAR(50) NOT NULL CHECK (pattern_type IN (
        'CONSECUTIVE_SHORTAGES',    -- Faltantes consecutivos
        'SAME_AMOUNT_SHORTAGE',     -- Mismo monto de faltante repetido
        'SHIFT_END_SHORTAGE',       -- Faltantes solo al final de turno
        'USER_CORRELATION',         -- Correlación con usuario específico
        'TERMINAL_CORRELATION',     -- Correlación con terminal específico
        'TIME_CORRELATION'          -- Correlación con horario específico
    )),
    
    -- Entidad correlacionada
    correlated_entity_type VARCHAR(30), -- 'USER', 'TERMINAL', 'LOCATION'
    correlated_entity_id UUID,
    
    -- Estadísticas del patrón
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    avg_amount NUMERIC(15,2),
    first_occurrence TIMESTAMP WITH TIME ZONE,
    last_occurrence TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Reconciliaciones involucradas
    reconciliation_ids UUID[] NOT NULL,
    
    -- Estado
    status VARCHAR(20) DEFAULT 'DETECTED' CHECK (status IN ('DETECTED', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED')),
    investigation_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PARTE 5: ÍNDICES
-- =====================================================

-- Índices para reconciliations
CREATE INDEX IF NOT EXISTS idx_reconciliations_session ON cash_reconciliations(session_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_terminal ON cash_reconciliations(terminal_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_location ON cash_reconciliations(location_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON cash_reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_reconciliations_created_at ON cash_reconciliations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliations_created_by ON cash_reconciliations(created_by);
CREATE INDEX IF NOT EXISTS idx_reconciliations_difference ON cash_reconciliations(difference) 
    WHERE ABS(difference) > 500;
CREATE INDEX IF NOT EXISTS idx_reconciliations_pending ON cash_reconciliations(created_at)
    WHERE status = 'PENDING';

-- Índices para justifications
CREATE INDEX IF NOT EXISTS idx_justifications_reconciliation ON reconciliation_justifications(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_justifications_type ON reconciliation_justifications(justification_type);
CREATE INDEX IF NOT EXISTS idx_justifications_pending_validation ON reconciliation_justifications(created_at)
    WHERE validation_status IS NULL;

-- Índices para alerts
CREATE INDEX IF NOT EXISTS idx_alerts_reconciliation ON reconciliation_alerts(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON reconciliation_alerts(status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON reconciliation_alerts(severity, created_at DESC);

-- Índices para patterns
CREATE INDEX IF NOT EXISTS idx_patterns_type ON reconciliation_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_entity ON reconciliation_patterns(correlated_entity_type, correlated_entity_id);
CREATE INDEX IF NOT EXISTS idx_patterns_active ON reconciliation_patterns(status) 
    WHERE status IN ('DETECTED', 'INVESTIGATING');

-- =====================================================
-- PARTE 6: VISTAS
-- =====================================================

-- Vista de resumen de conciliaciones por período
CREATE OR REPLACE VIEW v_reconciliation_summary AS
SELECT 
    DATE_TRUNC('day', cr.created_at) AS date,
    cr.location_id,
    COUNT(*) AS total_reconciliations,
    SUM(CASE WHEN cr.difference_type = 'BALANCED' THEN 1 ELSE 0 END) AS balanced_count,
    SUM(CASE WHEN cr.difference_type = 'SHORTAGE' THEN 1 ELSE 0 END) AS shortage_count,
    SUM(CASE WHEN cr.difference_type = 'SURPLUS' THEN 1 ELSE 0 END) AS surplus_count,
    COALESCE(SUM(CASE WHEN cr.difference < 0 THEN cr.difference ELSE 0 END), 0) AS total_shortage,
    COALESCE(SUM(CASE WHEN cr.difference > 0 THEN cr.difference ELSE 0 END), 0) AS total_surplus,
    ROUND(AVG(ABS(cr.difference)), 2) AS avg_absolute_difference,
    COUNT(*) FILTER (WHERE cr.status = 'PENDING') AS pending_count,
    COUNT(*) FILTER (WHERE cr.status = 'UNDER_INVESTIGATION') AS under_investigation_count
FROM cash_reconciliations cr
GROUP BY DATE_TRUNC('day', cr.created_at), cr.location_id
ORDER BY date DESC;

-- Vista de historial de un cajero
CREATE OR REPLACE VIEW v_cashier_reconciliation_history AS
SELECT 
    cr.created_by AS user_id,
    COUNT(*) AS total_shifts,
    SUM(CASE WHEN cr.difference_type = 'BALANCED' THEN 1 ELSE 0 END) AS balanced_shifts,
    SUM(CASE WHEN cr.difference < -1000 THEN 1 ELSE 0 END) AS major_shortage_count,
    SUM(CASE WHEN cr.difference > 1000 THEN 1 ELSE 0 END) AS major_surplus_count,
    ROUND(SUM(cr.difference), 2) AS net_difference,
    ROUND(AVG(cr.difference), 2) AS avg_difference,
    ROUND(STDDEV(cr.difference), 2) AS stddev_difference,
    MAX(ABS(cr.difference)) AS max_absolute_difference,
    MIN(cr.created_at) AS first_reconciliation,
    MAX(cr.created_at) AS last_reconciliation
FROM cash_reconciliations cr
GROUP BY cr.created_by;

-- Vista de conciliaciones problemáticas
CREATE OR REPLACE VIEW v_problematic_reconciliations AS
SELECT 
    cr.id,
    cr.session_id,
    cr.terminal_id,
    cr.location_id,
    cr.difference,
    cr.difference_type,
    cr.status,
    cr.created_at,
    cr.created_by,
    COALESCE(
        (SELECT SUM(rj.amount_justified) FROM reconciliation_justifications rj WHERE rj.reconciliation_id = cr.id),
        0
    ) AS total_justified,
    ABS(cr.difference) - COALESCE(
        (SELECT SUM(rj.amount_justified) FROM reconciliation_justifications rj WHERE rj.reconciliation_id = cr.id),
        0
    ) AS pending_justification,
    (SELECT COUNT(*) FROM reconciliation_alerts ra WHERE ra.reconciliation_id = cr.id AND ra.status = 'OPEN') AS open_alerts
FROM cash_reconciliations cr
WHERE cr.status IN ('PENDING', 'UNDER_INVESTIGATION')
   OR (ABS(cr.difference) > 500 AND cr.approved_at IS NULL)
ORDER BY ABS(cr.difference) DESC;

-- Vista de alertas activas con contexto
CREATE OR REPLACE VIEW v_active_reconciliation_alerts AS
SELECT 
    ra.id AS alert_id,
    ra.alert_type,
    ra.severity,
    ra.status AS alert_status,
    ra.created_at AS alert_created_at,
    cr.id AS reconciliation_id,
    cr.difference,
    cr.difference_type,
    cr.created_by AS cashier_id,
    cr.terminal_id,
    cr.location_id,
    cr.created_at AS reconciliation_date
FROM reconciliation_alerts ra
JOIN cash_reconciliations cr ON ra.reconciliation_id = cr.id
WHERE ra.status IN ('OPEN', 'ACKNOWLEDGED')
ORDER BY 
    CASE ra.severity 
        WHEN 'CRITICAL' THEN 1 
        WHEN 'HIGH' THEN 2 
        WHEN 'MEDIUM' THEN 3 
        ELSE 4 
    END,
    ra.created_at DESC;

-- =====================================================
-- PARTE 7: FUNCIONES HELPER
-- =====================================================

-- Función para calcular el monto teórico de una sesión
CREATE OR REPLACE FUNCTION fn_calculate_theoretical_amount(p_session_id UUID)
RETURNS TABLE (
    opening_amount NUMERIC,
    cash_sales_total NUMERIC,
    cash_movements_in NUMERIC,
    cash_movements_out NUMERIC,
    theoretical_total NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(s.opening_amount, 0)::NUMERIC AS opening_amount,
        COALESCE((
            SELECT SUM(total_amount) 
            FROM sales 
            WHERE terminal_id = s.terminal_id 
            AND payment_method = 'CASH'
            AND timestamp BETWEEN s.opened_at AND COALESCE(s.closed_at, NOW())
        ), 0)::NUMERIC AS cash_sales_total,
        COALESCE((
            SELECT SUM(amount) 
            FROM cash_movements 
            WHERE session_id = s.id 
            AND type IN ('EXTRA_INCOME')
        ), 0)::NUMERIC AS cash_movements_in,
        COALESCE((
            SELECT SUM(amount) 
            FROM cash_movements 
            WHERE session_id = s.id 
            AND type IN ('WITHDRAWAL', 'EXPENSE')
        ), 0)::NUMERIC AS cash_movements_out,
        (
            COALESCE(s.opening_amount, 0) +
            COALESCE((SELECT SUM(total_amount) FROM sales WHERE terminal_id = s.terminal_id AND payment_method = 'CASH' AND timestamp BETWEEN s.opened_at AND COALESCE(s.closed_at, NOW())), 0) +
            COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = s.id AND type IN ('EXTRA_INCOME')), 0) -
            COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = s.id AND type IN ('WITHDRAWAL', 'EXPENSE')), 0)
        )::NUMERIC AS theoretical_total
    FROM cash_register_sessions s
    WHERE s.id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Función para detectar patrones
CREATE OR REPLACE FUNCTION fn_detect_reconciliation_patterns(p_user_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    pattern_type VARCHAR,
    occurrence_count BIGINT,
    total_amount NUMERIC,
    avg_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    -- Detectar faltantes consecutivos
    SELECT 
        'CONSECUTIVE_SHORTAGES'::VARCHAR AS pattern_type,
        COUNT(*)::BIGINT AS occurrence_count,
        SUM(ABS(cr.difference))::NUMERIC AS total_amount,
        AVG(ABS(cr.difference))::NUMERIC AS avg_amount
    FROM cash_reconciliations cr
    WHERE cr.created_by = p_user_id
    AND cr.difference < -500
    AND cr.created_at > NOW() - (p_days || ' days')::INTERVAL
    HAVING COUNT(*) >= 3
    
    UNION ALL
    
    -- Detectar mismo monto repetido
    SELECT 
        'SAME_AMOUNT_SHORTAGE'::VARCHAR AS pattern_type,
        COUNT(*)::BIGINT AS occurrence_count,
        SUM(ABS(cr.difference))::NUMERIC AS total_amount,
        AVG(ABS(cr.difference))::NUMERIC AS avg_amount
    FROM cash_reconciliations cr
    WHERE cr.created_by = p_user_id
    AND cr.difference < -500
    AND cr.created_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY ROUND(cr.difference, -2) -- Agrupar por centenas
    HAVING COUNT(*) >= 2;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PARTE 8: TRIGGER PARA AUTO-ALERTAS
-- =====================================================

CREATE OR REPLACE FUNCTION fn_reconciliation_auto_alert()
RETURNS TRIGGER AS $$
DECLARE
    v_alert_type VARCHAR(30);
    v_severity VARCHAR(10);
BEGIN
    -- Solo crear alertas para diferencias significativas
    IF ABS(NEW.difference) <= 500 THEN
        RETURN NEW;
    END IF;
    
    -- Determinar tipo y severidad de alerta
    IF NEW.difference < -5000 THEN
        v_alert_type := 'CRITICAL_SHORTAGE';
        v_severity := 'CRITICAL';
    ELSIF NEW.difference < -1000 THEN
        v_alert_type := 'MAJOR_SHORTAGE';
        v_severity := 'HIGH';
    ELSIF NEW.difference < 0 THEN
        v_alert_type := 'MINOR_SHORTAGE';
        v_severity := 'MEDIUM';
    ELSIF NEW.difference > 5000 THEN
        v_alert_type := 'SUSPICIOUS_SURPLUS';
        v_severity := 'HIGH';
    ELSE
        v_alert_type := 'SUSPICIOUS_SURPLUS';
        v_severity := 'MEDIUM';
    END IF;
    
    -- Crear alerta
    INSERT INTO reconciliation_alerts (
        reconciliation_id,
        alert_type,
        severity
    ) VALUES (
        NEW.id,
        v_alert_type,
        v_severity
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reconciliation_auto_alert ON cash_reconciliations;
CREATE TRIGGER trigger_reconciliation_auto_alert
AFTER INSERT ON cash_reconciliations
FOR EACH ROW
EXECUTE FUNCTION fn_reconciliation_auto_alert();

-- =====================================================
-- PARTE 9: REGISTRO DE MIGRACIÓN
-- =====================================================

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '006_reconciliation_module',
    'Módulo de conciliación financiera con justificaciones, alertas y detección de patrones',
    MD5('006_reconciliation_module.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

DO $$
BEGIN
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cash_reconciliations'), 
        'Tabla cash_reconciliations no existe';
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reconciliation_justifications'), 
        'Tabla reconciliation_justifications no existe';
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reconciliation_alerts'), 
        'Tabla reconciliation_alerts no existe';
    
    RAISE NOTICE '✅ Migración 006_reconciliation_module completada exitosamente';
END $$;
