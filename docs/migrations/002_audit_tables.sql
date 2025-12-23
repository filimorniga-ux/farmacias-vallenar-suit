-- =====================================================
-- MIGRACIÓN 002: Sistema de Auditoría Forense Completo
-- Pharma-Synapse v3.1
-- Fecha: 2025-12-23
-- =====================================================

BEGIN;

-- =====================================================
-- PASO 1: CREAR TABLA PRINCIPAL DE AUDITORÍA
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_events (
    -- Identificación
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(50) NOT NULL UNIQUE, -- Formato: EVT-YYYYMMDD-XXXXXX
    
    -- Contexto de Negocio
    location_id UUID,
    terminal_id UUID,
    session_id VARCHAR(50),
    
    -- Actor
    user_id UUID,
    user_role VARCHAR(50),
    impersonated_by UUID, -- Si un admin actúa en nombre de otro
    
    -- Acción
    action_category VARCHAR(50) NOT NULL, -- 'CASH', 'SALE', 'INVENTORY', 'AUTH', 'CONFIG'
    action_type VARCHAR(100) NOT NULL,    -- 'OPEN_SHIFT', 'CREATE_SALE', etc.
    action_status VARCHAR(20) DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILED', 'BLOCKED'
    
    -- Datos del Cambio
    resource_type VARCHAR(50),  -- 'SALE', 'SESSION', 'PRODUCT', etc.
    resource_id VARCHAR(100),   -- ID del recurso afectado
    old_values JSONB,           -- Estado anterior (para UPDATE/DELETE)
    new_values JSONB,           -- Estado nuevo (para INSERT/UPDATE)
    delta_amount NUMERIC(15,2), -- Si aplica cambio monetario
    
    -- Metadata Técnica
    ip_address INET,
    user_agent TEXT,
    request_id UUID,            -- Para correlación con logs de app
    correlation_id UUID,        -- Para flujos multi-paso
    
    -- Compliance
    requires_manager_review BOOLEAN DEFAULT FALSE,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    
    -- Temporal
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Constraints
    CONSTRAINT chk_audit_action_status CHECK (action_status IN ('SUCCESS', 'FAILED', 'BLOCKED', 'PENDING')),
    CONSTRAINT chk_audit_category CHECK (action_category IN ('CASH', 'SALE', 'INVENTORY', 'AUTH', 'CONFIG', 'ADMIN', 'SYSTEM', 'REPORT'))
);

-- Comentarios para documentación
COMMENT ON TABLE audit_events IS 'Registro forense de todas las acciones críticas del sistema';
COMMENT ON COLUMN audit_events.event_id IS 'ID legible único formato EVT-YYYYMMDD-XXXXXX';
COMMENT ON COLUMN audit_events.old_values IS 'Snapshot JSON del estado anterior del recurso';
COMMENT ON COLUMN audit_events.new_values IS 'Snapshot JSON del nuevo estado del recurso';
COMMENT ON COLUMN audit_events.requires_manager_review IS 'Flag para acciones que requieren revisión manual';

-- =====================================================
-- PASO 2: CREAR ÍNDICES PARA QUERIES FRECUENTES
-- =====================================================

-- Búsqueda por ubicación y fecha (reportes diarios)
CREATE INDEX idx_audit_events_location_date 
    ON audit_events(location_id, created_at DESC);

-- Búsqueda por usuario (historial de acciones)
CREATE INDEX idx_audit_events_user 
    ON audit_events(user_id, created_at DESC);

-- Búsqueda por sesión de caja
CREATE INDEX idx_audit_events_session 
    ON audit_events(session_id) 
    WHERE session_id IS NOT NULL;

-- Búsqueda por recurso afectado
CREATE INDEX idx_audit_events_resource 
    ON audit_events(resource_type, resource_id);

-- Búsqueda por tipo de acción
CREATE INDEX idx_audit_events_action 
    ON audit_events(action_category, action_type);

-- Cola de revisiones pendientes
CREATE INDEX idx_audit_events_pending_review 
    ON audit_events(requires_manager_review, created_at) 
    WHERE requires_manager_review = TRUE AND reviewed_at IS NULL;

-- Búsqueda en JSONB (para investigaciones)
CREATE INDEX idx_audit_events_old_values 
    ON audit_events USING GIN (old_values jsonb_path_ops);
CREATE INDEX idx_audit_events_new_values 
    ON audit_events USING GIN (new_values jsonb_path_ops);

-- =====================================================
-- PASO 3: FUNCIÓN PARA GENERAR EVENT_ID
-- =====================================================

CREATE OR REPLACE FUNCTION generate_event_id() 
RETURNS VARCHAR(50) AS $$
DECLARE
    v_date VARCHAR(8);
    v_random VARCHAR(6);
BEGIN
    v_date := TO_CHAR(NOW(), 'YYYYMMDD');
    v_random := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    RETURN 'EVT-' || v_date || '-' || v_random;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-generar event_id
CREATE OR REPLACE FUNCTION set_event_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_id IS NULL THEN
        NEW.event_id := generate_event_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_event_id
BEFORE INSERT ON audit_events
FOR EACH ROW
EXECUTE FUNCTION set_event_id();

-- =====================================================
-- PASO 4: FUNCIÓN HELPER PARA INSERTAR EVENTOS
-- =====================================================

CREATE OR REPLACE FUNCTION log_audit_event(
    p_action_category VARCHAR(50),
    p_action_type VARCHAR(100),
    p_user_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL,
    p_terminal_id UUID DEFAULT NULL,
    p_session_id VARCHAR(50) DEFAULT NULL,
    p_resource_type VARCHAR(50) DEFAULT NULL,
    p_resource_id VARCHAR(100) DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_delta_amount NUMERIC(15,2) DEFAULT NULL,
    p_action_status VARCHAR(20) DEFAULT 'SUCCESS',
    p_requires_review BOOLEAN DEFAULT FALSE,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
    v_user_role VARCHAR(50);
BEGIN
    -- Obtener rol del usuario si existe
    IF p_user_id IS NOT NULL THEN
        SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
    END IF;
    
    INSERT INTO audit_events (
        action_category, action_type, action_status,
        user_id, user_role, location_id, terminal_id, session_id,
        resource_type, resource_id, old_values, new_values, delta_amount,
        requires_manager_review, ip_address, user_agent, request_id
    ) VALUES (
        p_action_category, p_action_type, p_action_status,
        p_user_id, v_user_role, p_location_id, p_terminal_id, p_session_id,
        p_resource_type, p_resource_id, p_old_values, p_new_values, p_delta_amount,
        p_requires_review, p_ip_address, p_user_agent, p_request_id
    )
    RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PASO 5: TRIGGERS AUTOMÁTICOS PARA TABLAS CRÍTICAS
-- =====================================================

-- Trigger para SALES
CREATE OR REPLACE FUNCTION audit_sales_trigger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM log_audit_event(
        'SALE',
        TG_OP,
        COALESCE(NEW.user_id, OLD.user_id),
        COALESCE(NEW.location_id, OLD.location_id),
        COALESCE(NEW.terminal_id, OLD.terminal_id),
        COALESCE(NEW.shift_id, OLD.shift_id),
        'SALE',
        COALESCE(NEW.id, OLD.id)::text,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        COALESCE(NEW.total_amount, 0) - COALESCE(OLD.total_amount, 0),
        'SUCCESS',
        FALSE
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_sales ON sales;
CREATE TRIGGER trg_audit_sales
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION audit_sales_trigger();

-- Trigger para CASH_REGISTER_SESSIONS
CREATE OR REPLACE FUNCTION audit_sessions_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_requires_review BOOLEAN := FALSE;
BEGIN
    -- Marcar para revisión si es cierre forzado o automático
    IF NEW.status IN ('CLOSED_FORCE', 'CLOSED_AUTO') THEN
        v_requires_review := TRUE;
    END IF;
    
    PERFORM log_audit_event(
        'CASH',
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'OPEN_SHIFT'
            WHEN TG_OP = 'UPDATE' AND NEW.status LIKE 'CLOSED%' THEN 'CLOSE_SHIFT'
            ELSE TG_OP
        END,
        COALESCE(NEW.user_id, OLD.user_id)::uuid,
        NULL, -- location_id obtenido de terminal
        COALESCE(NEW.terminal_id, OLD.terminal_id),
        COALESCE(NEW.id, OLD.id),
        'SESSION',
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        COALESCE(NEW.closing_amount, 0) - COALESCE(NEW.opening_amount, 0),
        'SUCCESS',
        v_requires_review
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_sessions ON cash_register_sessions;
CREATE TRIGGER trg_audit_sessions
AFTER INSERT OR UPDATE ON cash_register_sessions
FOR EACH ROW EXECUTE FUNCTION audit_sessions_trigger();

-- Trigger para CASH_MOVEMENTS
CREATE OR REPLACE FUNCTION audit_cash_movements_trigger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM log_audit_event(
        'CASH',
        'CASH_MOVEMENT_' || UPPER(NEW.type),
        NEW.user_id,
        NULL,
        NEW.terminal_id,
        NEW.session_id,
        'CASH_MOVEMENT',
        NEW.id::text,
        NULL,
        to_jsonb(NEW),
        NEW.amount,
        'SUCCESS',
        NEW.type IN ('WITHDRAWAL', 'EXPENSE') AND NEW.amount > 50000 -- Review grandes egresos
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_cash_movements ON cash_movements;
CREATE TRIGGER trg_audit_cash_movements
AFTER INSERT ON cash_movements
FOR EACH ROW EXECUTE FUNCTION audit_cash_movements_trigger();

-- =====================================================
-- PASO 6: VISTA DE EVENTOS PENDIENTES DE REVISIÓN
-- =====================================================

CREATE OR REPLACE VIEW v_pending_audit_reviews AS
SELECT 
    ae.id,
    ae.event_id,
    ae.action_category,
    ae.action_type,
    ae.resource_type,
    ae.resource_id,
    ae.delta_amount,
    ae.created_at,
    u.name as user_name,
    t.name as terminal_name,
    l.name as location_name,
    ae.new_values,
    EXTRACT(EPOCH FROM (NOW() - ae.created_at))/3600 as hours_pending
FROM audit_events ae
LEFT JOIN users u ON ae.user_id = u.id
LEFT JOIN terminals t ON ae.terminal_id = t.id
LEFT JOIN locations l ON ae.location_id = l.id
WHERE ae.requires_manager_review = TRUE
  AND ae.reviewed_at IS NULL
ORDER BY 
    CASE ae.action_category 
        WHEN 'CASH' THEN 1 
        WHEN 'SALE' THEN 2 
        ELSE 3 
    END,
    ae.created_at ASC;

-- =====================================================
-- PASO 7: FUNCIÓN PARA MARCAR COMO REVISADO
-- =====================================================

CREATE OR REPLACE FUNCTION review_audit_event(
    p_event_id UUID,
    p_reviewer_id UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE audit_events
    SET reviewed_by = p_reviewer_id,
        reviewed_at = NOW(),
        review_notes = p_notes
    WHERE id = p_event_id
      AND requires_manager_review = TRUE
      AND reviewed_at IS NULL;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PASO 8: MIGRAR DATOS DE TABLA LEGACY (audit_logs)
-- =====================================================

-- Migrar registros existentes (si la tabla legacy existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        INSERT INTO audit_events (
            action_category,
            action_type,
            user_id,
            new_values,
            ip_address,
            created_at,
            action_status
        )
        SELECT 
            CASE 
                WHEN accion LIKE '%CLOSE%' THEN 'CASH'
                WHEN accion LIKE '%SALE%' THEN 'SALE'
                WHEN accion LIKE '%LOGIN%' OR accion LIKE '%AUTH%' THEN 'AUTH'
                ELSE 'ADMIN'
            END,
            accion,
            CASE WHEN usuario ~ '^[0-9a-f]{8}-' THEN usuario::uuid ELSE NULL END,
            jsonb_build_object('legacy_detail', detalle),
            ip::inet,
            fecha,
            'SUCCESS'
        FROM audit_logs
        WHERE fecha > NOW() - INTERVAL '90 days' -- Solo últimos 90 días
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Migrated % records from audit_logs', (SELECT COUNT(*) FROM audit_logs WHERE fecha > NOW() - INTERVAL '90 days');
    END IF;
END $$;

-- =====================================================
-- PASO 9: REGISTRAR MIGRACIÓN
-- =====================================================

INSERT INTO schema_migrations (version, description, checksum, applied_at)
VALUES (
    '20251223002',
    'Create forensic audit system with triggers',
    MD5('002_audit_tables.sql'),
    NOW()
) ON CONFLICT (version) DO NOTHING;

COMMIT;
