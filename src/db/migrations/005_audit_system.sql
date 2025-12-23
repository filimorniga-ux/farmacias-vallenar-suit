-- =====================================================
-- MIGRACIÓN 005: Sistema de Auditoría Forense
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================
-- Tiempo estimado: 2-5 minutos
-- NOTA: No requiere ventana de mantenimiento
-- =====================================================

BEGIN;

-- =====================================================
-- PARTE 1: CATÁLOGO DE ACCIONES AUDITABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_action_catalog (
    code VARCHAR(50) PRIMARY KEY,
    category VARCHAR(30) NOT NULL CHECK (category IN ('FINANCIAL', 'SECURITY', 'OPERATIONAL', 'COMPLIANCE')),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT NOT NULL,
    requires_justification BOOLEAN DEFAULT FALSE,
    retention_days INTEGER DEFAULT 2555 -- 7 años por defecto (requisito SII Chile)
);

-- Insertar catálogo de acciones
INSERT INTO audit_action_catalog (code, category, severity, description, requires_justification, retention_days) VALUES
    -- Acciones Financieras
    ('SALE_CREATE', 'FINANCIAL', 'MEDIUM', 'Venta registrada', FALSE, 2555),
    ('SALE_VOID', 'FINANCIAL', 'CRITICAL', 'Anulación de venta', TRUE, 2555),
    ('SALE_REFUND', 'FINANCIAL', 'HIGH', 'Devolución procesada', TRUE, 2555),
    ('SALE_DISCOUNT', 'FINANCIAL', 'MEDIUM', 'Descuento aplicado a venta', FALSE, 2555),
    ('PRICE_CHANGE', 'FINANCIAL', 'CRITICAL', 'Modificación de precio de producto', TRUE, 2555),
    ('STOCK_ADJUST', 'FINANCIAL', 'HIGH', 'Ajuste manual de inventario', TRUE, 2555),
    ('CASH_MOVEMENT', 'FINANCIAL', 'MEDIUM', 'Movimiento de efectivo (ingreso/egreso)', FALSE, 2555),
    ('TREASURY_TRANSFER', 'FINANCIAL', 'HIGH', 'Transferencia entre cuentas de tesorería', FALSE, 2555),
    ('REMITTANCE_CREATE', 'FINANCIAL', 'MEDIUM', 'Remesa de caja a caja fuerte', FALSE, 2555),
    ('REMITTANCE_CONFIRM', 'FINANCIAL', 'MEDIUM', 'Confirmación de recepción de remesa', FALSE, 2555),
    
    -- Acciones Operacionales de Caja
    ('SESSION_OPEN', 'OPERATIONAL', 'MEDIUM', 'Apertura de sesión de caja', FALSE, 2555),
    ('SESSION_CLOSE', 'OPERATIONAL', 'MEDIUM', 'Cierre normal de sesión de caja', FALSE, 2555),
    ('SESSION_FORCE_CLOSE', 'SECURITY', 'CRITICAL', 'Cierre forzado de sesión (admin override)', TRUE, 2555),
    ('SESSION_AUTO_CLOSE', 'OPERATIONAL', 'HIGH', 'Cierre automático por timeout', FALSE, 2555),
    ('RECONCILIATION', 'FINANCIAL', 'CRITICAL', 'Conciliación de arqueo de caja', TRUE, 2555),
    ('RECONCILIATION_JUSTIFY', 'FINANCIAL', 'HIGH', 'Justificación de diferencia en arqueo', TRUE, 2555),
    
    -- Acciones de Seguridad
    ('USER_LOGIN', 'SECURITY', 'LOW', 'Inicio de sesión de usuario', FALSE, 365),
    ('USER_LOGOUT', 'SECURITY', 'LOW', 'Cierre de sesión de usuario', FALSE, 365),
    ('USER_LOGIN_FAILED', 'SECURITY', 'HIGH', 'Intento fallido de inicio de sesión', FALSE, 365),
    ('USER_LOCKED', 'SECURITY', 'CRITICAL', 'Usuario bloqueado por intentos fallidos', FALSE, 730),
    ('USER_UNLOCKED', 'SECURITY', 'HIGH', 'Usuario desbloqueado por admin', TRUE, 730),
    ('PASSWORD_CHANGE', 'SECURITY', 'MEDIUM', 'Cambio de contraseña/PIN', FALSE, 730),
    ('PASSWORD_RESET', 'SECURITY', 'HIGH', 'Reset de contraseña por admin', TRUE, 730),
    ('PERMISSION_CHANGE', 'SECURITY', 'HIGH', 'Cambio de permisos de usuario', TRUE, 2555),
    ('ROLE_CHANGE', 'SECURITY', 'HIGH', 'Cambio de rol de usuario', TRUE, 2555),
    
    -- Acciones de Configuración
    ('CONFIG_CHANGE', 'OPERATIONAL', 'HIGH', 'Cambio de configuración del sistema', TRUE, 2555),
    ('TERMINAL_CREATE', 'OPERATIONAL', 'MEDIUM', 'Creación de terminal POS', FALSE, 2555),
    ('TERMINAL_UPDATE', 'OPERATIONAL', 'MEDIUM', 'Modificación de terminal POS', FALSE, 2555),
    ('TERMINAL_DELETE', 'OPERATIONAL', 'HIGH', 'Eliminación de terminal POS', TRUE, 2555),
    ('LOCATION_CREATE', 'OPERATIONAL', 'HIGH', 'Creación de sucursal/ubicación', TRUE, 2555),
    ('LOCATION_UPDATE', 'OPERATIONAL', 'MEDIUM', 'Modificación de sucursal/ubicación', FALSE, 2555),
    
    -- Acciones de Compliance (SII)
    ('DTE_EMIT', 'COMPLIANCE', 'MEDIUM', 'Emisión de documento tributario electrónico', FALSE, 2555),
    ('DTE_VOID', 'COMPLIANCE', 'CRITICAL', 'Anulación de DTE', TRUE, 2555),
    ('DTE_CREDIT_NOTE', 'COMPLIANCE', 'HIGH', 'Emisión de nota de crédito', TRUE, 2555),
    ('CAF_LOAD', 'COMPLIANCE', 'HIGH', 'Carga de folios CAF', FALSE, 2555),
    ('SII_CONFIG_CHANGE', 'COMPLIANCE', 'CRITICAL', 'Cambio de configuración SII', TRUE, 2555),
    
    -- Acciones de Reportería
    ('REPORT_GENERATE', 'OPERATIONAL', 'LOW', 'Generación de reporte', FALSE, 365),
    ('REPORT_EXPORT', 'OPERATIONAL', 'MEDIUM', 'Exportación de datos', FALSE, 730),
    ('DATA_EXPORT_BULK', 'OPERATIONAL', 'HIGH', 'Exportación masiva de datos', TRUE, 730)
ON CONFLICT (code) DO UPDATE SET
    category = EXCLUDED.category,
    severity = EXCLUDED.severity,
    description = EXCLUDED.description,
    requires_justification = EXCLUDED.requires_justification,
    retention_days = EXCLUDED.retention_days;

-- =====================================================
-- PARTE 2: TABLA PRINCIPAL DE AUDITORÍA
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificación temporal precisa
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    client_timestamp TIMESTAMP WITH TIME ZONE,
    
    -- Contexto de usuario
    user_id UUID,
    user_role VARCHAR(30),
    user_name VARCHAR(255),
    
    -- Contexto de sesión/terminal/ubicación
    session_id UUID,
    terminal_id UUID,
    location_id UUID,
    
    -- Acción realizada
    action_code VARCHAR(50) NOT NULL,
    
    -- Entidad afectada
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    
    -- Datos de cambio (JSONB para flexibilidad)
    old_values JSONB,
    new_values JSONB,
    metadata JSONB,
    
    -- Justificación (requerida para acciones críticas)
    justification TEXT,
    authorized_by UUID,
    
    -- Trazabilidad técnica
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    
    -- Integridad (blockchain-like)
    checksum VARCHAR(64),
    previous_checksum VARCHAR(64),
    
    -- Foreign Keys (opcionales para permitir datos históricos)
    CONSTRAINT fk_audit_action FOREIGN KEY (action_code) 
        REFERENCES audit_action_catalog(code) ON DELETE RESTRICT
);

-- Comentarios de documentación
COMMENT ON TABLE audit_log IS 'Log de auditoría inmutable para trazabilidad forense';
COMMENT ON COLUMN audit_log.checksum IS 'SHA-256 del registro para verificar integridad';
COMMENT ON COLUMN audit_log.previous_checksum IS 'Checksum del registro anterior (encadenamiento)';
COMMENT ON COLUMN audit_log.old_values IS 'Estado anterior de la entidad (NULL si es creación)';
COMMENT ON COLUMN audit_log.new_values IS 'Estado nuevo de la entidad (NULL si es eliminación)';

-- =====================================================
-- PARTE 3: ÍNDICES OPTIMIZADOS
-- =====================================================

-- Índice principal por fecha (consultas más comunes)
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at 
ON audit_log(created_at DESC);

-- Índice por usuario
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id 
ON audit_log(user_id) 
WHERE user_id IS NOT NULL;

-- Índice por acción
CREATE INDEX IF NOT EXISTS idx_audit_log_action 
ON audit_log(action_code);

-- Índice compuesto para búsqueda de entidad
CREATE INDEX IF NOT EXISTS idx_audit_log_entity 
ON audit_log(entity_type, entity_id);

-- Índice por sesión de caja
CREATE INDEX IF NOT EXISTS idx_audit_log_session 
ON audit_log(session_id) 
WHERE session_id IS NOT NULL;

-- Índice por ubicación
CREATE INDEX IF NOT EXISTS idx_audit_log_location 
ON audit_log(location_id) 
WHERE location_id IS NOT NULL;

-- Índice para acciones críticas (alertas y reportes)
CREATE INDEX IF NOT EXISTS idx_audit_log_critical 
ON audit_log(created_at DESC, action_code) 
WHERE action_code IN (
    SELECT code FROM audit_action_catalog WHERE severity IN ('HIGH', 'CRITICAL')
);

-- Índice para verificación de integridad
CREATE INDEX IF NOT EXISTS idx_audit_log_checksum 
ON audit_log(checksum);

-- =====================================================
-- PARTE 4: TRIGGERS DE INMUTABILIDAD Y CHECKSUM
-- =====================================================

-- Función para calcular checksum antes de insertar
CREATE OR REPLACE FUNCTION audit_log_calculate_checksum()
RETURNS TRIGGER AS $$
DECLARE
    last_checksum VARCHAR(64);
    record_data TEXT;
BEGIN
    -- Obtener checksum del último registro (para encadenamiento)
    SELECT checksum INTO last_checksum 
    FROM audit_log 
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
    
    NEW.previous_checksum := COALESCE(last_checksum, 'GENESIS_BLOCK');
    
    -- Construir string para hash
    record_data := concat_ws('|',
        NEW.id::text,
        NEW.created_at::text,
        COALESCE(NEW.user_id::text, 'NULL'),
        NEW.action_code,
        NEW.entity_type,
        COALESCE(NEW.entity_id, 'NULL'),
        COALESCE(NEW.old_values::text, 'NULL'),
        COALESCE(NEW.new_values::text, 'NULL'),
        NEW.previous_checksum
    );
    
    -- Calcular SHA-256
    NEW.checksum := encode(sha256(record_data::bytea), 'hex');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular checksum
DROP TRIGGER IF EXISTS trigger_audit_log_checksum ON audit_log;
CREATE TRIGGER trigger_audit_log_checksum
BEFORE INSERT ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_calculate_checksum();

-- Función para prevenir modificaciones
CREATE OR REPLACE FUNCTION audit_log_prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: Los registros de auditoría no pueden ser modificados o eliminados. Operación % rechazada para registro %', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

-- Trigger para prevenir UPDATE
DROP TRIGGER IF EXISTS trigger_audit_log_no_update ON audit_log;
CREATE TRIGGER trigger_audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_prevent_modification();

-- Trigger para prevenir DELETE
DROP TRIGGER IF EXISTS trigger_audit_log_no_delete ON audit_log;
CREATE TRIGGER trigger_audit_log_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_prevent_modification();

-- =====================================================
-- PARTE 5: VISTAS DE REPORTERÍA
-- =====================================================

-- Vista de actividad sospechosa
CREATE OR REPLACE VIEW v_suspicious_activity AS
SELECT 
    al.created_at,
    al.user_name,
    al.user_role,
    al.action_code,
    ac.description AS action_description,
    ac.severity,
    al.entity_type,
    al.entity_id,
    al.ip_address,
    al.justification,
    al.terminal_id,
    al.location_id,
    al.metadata
FROM audit_log al
JOIN audit_action_catalog ac ON al.action_code = ac.code
WHERE ac.severity IN ('HIGH', 'CRITICAL')
ORDER BY al.created_at DESC;

COMMENT ON VIEW v_suspicious_activity IS 'Vista de acciones de alta severidad para revisión de seguridad';

-- Vista de timeline de usuario
CREATE OR REPLACE VIEW v_user_activity_timeline AS
SELECT 
    al.user_id,
    al.user_name,
    DATE_TRUNC('day', al.created_at) AS activity_date,
    al.action_code,
    ac.category,
    COUNT(*) AS action_count
FROM audit_log al
JOIN audit_action_catalog ac ON al.action_code = ac.code
WHERE al.user_id IS NOT NULL
GROUP BY al.user_id, al.user_name, DATE_TRUNC('day', al.created_at), al.action_code, ac.category
ORDER BY activity_date DESC, action_count DESC;

-- Vista de resumen diario por ubicación
CREATE OR REPLACE VIEW v_daily_audit_summary AS
SELECT 
    DATE_TRUNC('day', al.created_at) AS audit_date,
    al.location_id,
    COUNT(*) AS total_actions,
    COUNT(*) FILTER (WHERE ac.severity = 'CRITICAL') AS critical_count,
    COUNT(*) FILTER (WHERE ac.severity = 'HIGH') AS high_count,
    COUNT(*) FILTER (WHERE ac.category = 'FINANCIAL') AS financial_actions,
    COUNT(*) FILTER (WHERE ac.category = 'SECURITY') AS security_actions,
    COUNT(DISTINCT al.user_id) AS unique_users
FROM audit_log al
JOIN audit_action_catalog ac ON al.action_code = ac.code
GROUP BY DATE_TRUNC('day', al.created_at), al.location_id
ORDER BY audit_date DESC;

-- Vista de integridad de cadena
CREATE OR REPLACE VIEW v_audit_chain_integrity AS
WITH chain_check AS (
    SELECT 
        id,
        created_at,
        checksum,
        previous_checksum,
        LAG(checksum) OVER (ORDER BY created_at, id) AS expected_previous
    FROM audit_log
)
SELECT 
    id,
    created_at,
    checksum,
    previous_checksum,
    expected_previous,
    CASE 
        WHEN previous_checksum = 'GENESIS_BLOCK' THEN 'GENESIS'
        WHEN previous_checksum = expected_previous THEN 'VALID'
        WHEN expected_previous IS NULL THEN 'FIRST_AFTER_GENESIS'
        ELSE 'BROKEN_CHAIN'
    END AS chain_status
FROM chain_check
WHERE previous_checksum != expected_previous 
  AND previous_checksum != 'GENESIS_BLOCK'
  AND expected_previous IS NOT NULL;

COMMENT ON VIEW v_audit_chain_integrity IS 'Detecta registros con cadena de integridad rota';

-- =====================================================
-- PARTE 6: FUNCIÓN HELPER PARA INSERTAR AUDITORÍA
-- =====================================================

CREATE OR REPLACE FUNCTION fn_audit_log(
    p_user_id UUID,
    p_user_name VARCHAR(255),
    p_user_role VARCHAR(30),
    p_session_id UUID,
    p_terminal_id UUID,
    p_location_id UUID,
    p_action_code VARCHAR(50),
    p_entity_type VARCHAR(50),
    p_entity_id VARCHAR(100),
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_justification TEXT DEFAULT NULL,
    p_authorized_by UUID DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
    v_requires_justification BOOLEAN;
BEGIN
    -- Verificar si la acción requiere justificación
    SELECT requires_justification INTO v_requires_justification
    FROM audit_action_catalog
    WHERE code = p_action_code;
    
    IF v_requires_justification AND (p_justification IS NULL OR LENGTH(TRIM(p_justification)) < 10) THEN
        RAISE EXCEPTION 'La acción % requiere justificación de al menos 10 caracteres', p_action_code;
    END IF;
    
    -- Insertar registro
    INSERT INTO audit_log (
        user_id, user_name, user_role,
        session_id, terminal_id, location_id,
        action_code, entity_type, entity_id,
        old_values, new_values, metadata,
        justification, authorized_by,
        ip_address, user_agent, request_id
    ) VALUES (
        p_user_id, p_user_name, p_user_role,
        p_session_id, p_terminal_id, p_location_id,
        p_action_code, p_entity_type, p_entity_id,
        p_old_values, p_new_values, p_metadata,
        p_justification, p_authorized_by,
        p_ip_address, p_user_agent, p_request_id
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_audit_log IS 'Función helper para insertar registros de auditoría con validación';

-- =====================================================
-- PARTE 7: MIGRAR DATOS DE audit_logs LEGACY
-- =====================================================

-- Migrar datos existentes si hay tabla legacy
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        INSERT INTO audit_log (
            user_id,
            user_name,
            action_code,
            entity_type,
            entity_id,
            metadata,
            ip_address,
            created_at
        )
        SELECT 
            CASE WHEN usuario ~ '^[0-9a-f]{8}-' THEN usuario::uuid ELSE NULL END,
            usuario,
            CASE 
                WHEN accion = 'FORCE_CLOSE' THEN 'SESSION_FORCE_CLOSE'
                WHEN accion = 'FORCE_CLOSE_SUCCESS' THEN 'SESSION_FORCE_CLOSE'
                WHEN accion = 'LOGIN' THEN 'USER_LOGIN'
                WHEN accion = 'LOGOUT' THEN 'USER_LOGOUT'
                ELSE 'CONFIG_CHANGE' -- Fallback para acciones no mapeadas
            END,
            'LEGACY',
            NULL,
            jsonb_build_object('legacy_detail', detalle),
            ip::inet,
            fecha
        FROM audit_logs
        WHERE NOT EXISTS (
            SELECT 1 FROM audit_log WHERE metadata->>'legacy_detail' = audit_logs.detalle
        );
        
        RAISE NOTICE 'Datos migrados desde audit_logs legacy';
    END IF;
END $$;

-- =====================================================
-- PARTE 8: TABLA DE ALERTAS DEL SISTEMA
-- =====================================================

CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    message TEXT NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID,
    resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_status ON system_alerts(status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON system_alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(type);

-- =====================================================
-- PARTE 9: COLA DE REINTENTOS
-- =====================================================

CREATE TABLE IF NOT EXISTS retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_key VARCHAR(100) NOT NULL,
    context JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_pending 
ON retry_queue(next_retry_at) 
WHERE status = 'PENDING';

-- =====================================================
-- PARTE 10: REGISTRO DE MIGRACIÓN
-- =====================================================

INSERT INTO schema_migrations (version, description, checksum)
VALUES (
    '005_audit_system',
    'Sistema de auditoría forense con inmutabilidad y encadenamiento',
    MD5('005_audit_system.sql')
) ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;

-- =====================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- =====================================================

-- Verificar que las tablas se crearon
DO $$
BEGIN
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log'), 
        'Tabla audit_log no existe';
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_action_catalog'), 
        'Tabla audit_action_catalog no existe';
    ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_alerts'), 
        'Tabla system_alerts no existe';
    
    -- Verificar triggers
    ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_audit_log_checksum'), 
        'Trigger de checksum no existe';
    ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_audit_log_no_update'), 
        'Trigger de no-update no existe';
    ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_audit_log_no_delete'), 
        'Trigger de no-delete no existe';
    
    RAISE NOTICE '✅ Migración 005_audit_system completada exitosamente';
END $$;
