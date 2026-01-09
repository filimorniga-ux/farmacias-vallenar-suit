-- =====================================================
-- MIGRACIÓN 009: Smart Invoice Parsing Module
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================
-- Propósito: Infraestructura para lectura de facturas con IA
-- Dependencias: 008_accounts_payable.sql
-- Tiempo estimado: 2-3 minutos
-- No requiere ventana de mantenimiento
-- =====================================================

BEGIN;

-- =====================================================
-- PARTE 1: TABLA DE CONFIGURACIÓN DEL SISTEMA
-- =====================================================

CREATE TABLE IF NOT EXISTS system_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificación
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    
    -- Metadatos
    is_encrypted BOOLEAN DEFAULT false,
    config_type VARCHAR(20) DEFAULT 'STRING',
    -- STRING, NUMBER, BOOLEAN, JSON, ENCRYPTED
    
    description TEXT,
    category VARCHAR(50) DEFAULT 'GENERAL',
    -- GENERAL, AI, INTEGRATION, SECURITY, BILLING
    
    -- Validación
    validation_regex VARCHAR(200),
    min_value NUMERIC,
    max_value NUMERIC,
    allowed_values TEXT[], -- Para enums
    
    -- Auditoría
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_config_key_format CHECK (config_key ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT chk_config_type CHECK (config_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENCRYPTED'))
);

COMMENT ON TABLE system_configs IS 'Configuración dinámica del sistema - incluye API keys encriptadas';
COMMENT ON COLUMN system_configs.is_encrypted IS 'Si true, config_value está encriptado con AES-256-GCM';
COMMENT ON COLUMN system_configs.validation_regex IS 'Regex para validar el valor antes de guardar';

-- Índices
CREATE INDEX IF NOT EXISTS idx_system_configs_category ON system_configs(category);
CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(config_key);

-- =====================================================
-- PARTE 2: CONFIGURACIONES INICIALES PARA IA
-- =====================================================

INSERT INTO system_configs (config_key, config_type, category, description, allowed_values) VALUES
('AI_PROVIDER', 'STRING', 'AI', 'Proveedor de IA para parsing de facturas', ARRAY['OPENAI', 'GEMINI', 'ANTHROPIC']),
('AI_API_KEY', 'ENCRYPTED', 'AI', 'API Key del proveedor de IA (encriptada)', NULL),
('AI_MODEL', 'STRING', 'AI', 'Modelo de IA a usar', ARRAY['gpt-4o', 'gpt-4o-mini', 'gemini-1.5-flash', 'gemini-1.5-pro', 'claude-3-sonnet']),
('AI_MAX_TOKENS', 'NUMBER', 'AI', 'Máximo de tokens por request', NULL),
('AI_TEMPERATURE', 'NUMBER', 'AI', 'Temperatura del modelo (0.0-1.0)', NULL),
('AI_MONTHLY_LIMIT', 'NUMBER', 'AI', 'Límite mensual de requests de IA', NULL),
('AI_FALLBACK_PROVIDER', 'STRING', 'AI', 'Proveedor alternativo si el principal falla', ARRAY['OPENAI', 'GEMINI', 'NONE'])
ON CONFLICT (config_key) DO NOTHING;

-- Valores por defecto
UPDATE system_configs SET config_value = 'OPENAI' WHERE config_key = 'AI_PROVIDER' AND config_value IS NULL;
UPDATE system_configs SET config_value = 'gpt-4o-mini' WHERE config_key = 'AI_MODEL' AND config_value IS NULL;
UPDATE system_configs SET config_value = '4096' WHERE config_key = 'AI_MAX_TOKENS' AND config_value IS NULL;
UPDATE system_configs SET config_value = '0.1' WHERE config_key = 'AI_TEMPERATURE' AND config_value IS NULL;
UPDATE system_configs SET config_value = '1000' WHERE config_key = 'AI_MONTHLY_LIMIT' AND config_value IS NULL;
UPDATE system_configs SET config_value = 'NONE' WHERE config_key = 'AI_FALLBACK_PROVIDER' AND config_value IS NULL;

-- =====================================================
-- PARTE 3: TABLA DE STAGING DE FACTURAS (INVOICE PARSINGS)
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_parsings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- =========================================
    -- DATOS EXTRAÍDOS POR LA IA
    -- =========================================
    
    -- Proveedor
    supplier_rut VARCHAR(20),
    supplier_name VARCHAR(200),
    supplier_address TEXT,
    
    -- Documento
    document_type VARCHAR(20) DEFAULT 'FACTURA',
    -- FACTURA, BOLETA, GUIA_DESPACHO, NOTA_CREDITO
    invoice_number VARCHAR(50),
    issue_date DATE,
    due_date DATE,
    
    -- Totales (en CLP)
    net_amount NUMERIC(15,2),
    tax_amount NUMERIC(15,2),
    total_amount NUMERIC(15,2),
    discount_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Items extraídos
    parsed_items JSONB NOT NULL DEFAULT '[]',
    /*
    Estructura de cada item:
    {
        "line_number": 1,
        "supplier_sku": "ABC-123",
        "description": "Paracetamol 500mg x 100",
        "quantity": 10,
        "unit_cost": 5000,
        "total_cost": 50000,
        "mapped_product_id": null,
        "mapped_product_name": null,
        "mapping_status": "PENDING" -- PENDING, MAPPED, UNMAPPED, SKIPPED
    }
    */
    
    -- Notas del documento
    document_notes TEXT,
    
    -- =========================================
    -- METADATA DE PROCESAMIENTO
    -- =========================================
    
    -- Respuesta de la IA
    raw_ai_response JSONB,
    ai_provider VARCHAR(20), -- OPENAI, GEMINI, ANTHROPIC
    ai_model VARCHAR(50),
    processing_time_ms INTEGER,
    
    -- Confianza
    confidence_score NUMERIC(3,2), -- 0.00 a 1.00
    validation_warnings JSONB DEFAULT '[]',
    /*
    Estructura de warnings:
    [
        {"field": "tax_amount", "message": "IVA no coincide con 19%", "severity": "WARNING"},
        {"field": "supplier_rut", "message": "Dígito verificador inválido", "severity": "ERROR"}
    ]
    */
    
    -- =========================================
    -- ESTADO Y WORKFLOW
    -- =========================================
    
    status VARCHAR(20) DEFAULT 'PENDING',
    /*
    Estados:
    - PENDING: Esperando validación del usuario
    - VALIDATED: Usuario confirmó que los datos son correctos
    - MAPPING: Usuario está mapeando productos
    - PROCESSING: Creando registros en la DB
    - COMPLETED: Procesado exitosamente
    - PARTIAL: Completado con items sin mapear
    - ERROR: Error en el procesamiento
    - REJECTED: Rechazado por el usuario
    */
    
    -- Contadores de items
    total_items INTEGER DEFAULT 0,
    mapped_items INTEGER DEFAULT 0,
    unmapped_items INTEGER DEFAULT 0,
    
    -- =========================================
    -- VINCULACIONES (después de aprobar)
    -- =========================================
    
    supplier_id UUID,
    supplier_created BOOLEAN DEFAULT false, -- Si se creó un nuevo proveedor
    account_payable_id UUID,
    reception_id UUID, -- Si se creó recepción en WMS
    
    -- =========================================
    -- ARCHIVO ORIGINAL
    -- =========================================
    
    original_file_type VARCHAR(10), -- jpeg, png, pdf
    original_file_name VARCHAR(200),
    original_file_size INTEGER, -- bytes
    original_file_hash VARCHAR(64), -- SHA-256 para detectar duplicados
    
    -- =========================================
    -- UBICACIÓN Y AUDITORÍA
    -- (VARCHAR para compatibilidad con users.id)
    -- =========================================
    
    location_id UUID,
    
    created_by VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    validated_by VARCHAR(50),
    validated_at TIMESTAMP WITH TIME ZONE,
    
    processed_by VARCHAR(50),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    rejected_by VARCHAR(50),
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    error_message TEXT,
    error_details JSONB,
    
    -- =========================================
    -- CONSTRAINTS
    -- =========================================
    
    CONSTRAINT chk_ip_status CHECK (status IN (
        'PENDING', 'VALIDATED', 'MAPPING', 'PROCESSING', 
        'COMPLETED', 'PARTIAL', 'ERROR', 'REJECTED'
    )),
    CONSTRAINT chk_ip_document_type CHECK (document_type IN (
        'FACTURA', 'BOLETA', 'GUIA_DESPACHO', 'NOTA_CREDITO'
    )),
    CONSTRAINT chk_ip_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
    CONSTRAINT chk_ip_amounts CHECK (
        (net_amount IS NULL OR net_amount >= 0) AND
        (tax_amount IS NULL OR tax_amount >= 0) AND
        (total_amount IS NULL OR total_amount >= 0)
    )
);

COMMENT ON TABLE invoice_parsings IS 'Staging area para facturas procesadas con IA antes de aprobar';
COMMENT ON COLUMN invoice_parsings.confidence_score IS 'Nivel de confianza de la IA (0.0-1.0)';
COMMENT ON COLUMN invoice_parsings.original_file_hash IS 'Hash SHA-256 para detectar facturas duplicadas';

-- =====================================================
-- PARTE 4: ÍNDICES PARA PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_ip_status ON invoice_parsings(status);
CREATE INDEX IF NOT EXISTS idx_ip_supplier_rut ON invoice_parsings(supplier_rut);
CREATE INDEX IF NOT EXISTS idx_ip_invoice_number ON invoice_parsings(invoice_number);
CREATE INDEX IF NOT EXISTS idx_ip_created_at ON invoice_parsings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_location ON invoice_parsings(location_id);
CREATE INDEX IF NOT EXISTS idx_ip_file_hash ON invoice_parsings(original_file_hash);

-- Índice compuesto para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_ip_status_location ON invoice_parsings(status, location_id);

-- Índice para pendientes por usuario
CREATE INDEX IF NOT EXISTS idx_ip_pending_user ON invoice_parsings(created_by, status) 
    WHERE status IN ('PENDING', 'VALIDATED', 'MAPPING');

-- =====================================================
-- PARTE 5: ACTUALIZAR product_suppliers
-- =====================================================

-- Agregar campos para tracking de facturas
ALTER TABLE product_suppliers 
ADD COLUMN IF NOT EXISTS last_invoice_date DATE,
ADD COLUMN IF NOT EXISTS invoice_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_invoice_cost NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS average_cost NUMERIC(15,2);

-- Índice para búsqueda por SKU de proveedor (crítico para mapeo)
CREATE INDEX IF NOT EXISTS idx_ps_supplier_sku ON product_suppliers(supplier_id, supplier_sku);
CREATE INDEX IF NOT EXISTS idx_ps_sku_lookup ON product_suppliers(supplier_sku);

COMMENT ON COLUMN product_suppliers.last_invoice_date IS 'Última fecha que apareció en una factura';
COMMENT ON COLUMN product_suppliers.invoice_count IS 'Cantidad de veces que apareció en facturas';
COMMENT ON COLUMN product_suppliers.average_cost IS 'Costo promedio histórico de facturas';

-- =====================================================
-- PARTE 6: TABLA DE USO DE IA (TRACKING)
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Request
    provider VARCHAR(20) NOT NULL,
    model VARCHAR(50) NOT NULL,
    endpoint VARCHAR(100),
    
    -- Tokens
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    
    -- Costo estimado (USD)
    estimated_cost NUMERIC(10,6),
    
    -- Contexto
    action_type VARCHAR(50), -- INVOICE_PARSE, PRODUCT_MATCH, etc.
    entity_id UUID, -- ID del invoice_parsing u otra entidad
    
    -- Resultado
    success BOOLEAN DEFAULT true,
    error_code VARCHAR(50),
    response_time_ms INTEGER,
    
    -- Auditoría (VARCHAR para compatibilidad con users.id)
    user_id VARCHAR(50),
    location_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id, created_at DESC);
-- Nota: Usar AT TIME ZONE 'UTC' para hacer el índice inmutable
CREATE INDEX IF NOT EXISTS idx_ai_usage_month ON ai_usage_log(DATE_TRUNC('month', created_at AT TIME ZONE 'UTC'));

COMMENT ON TABLE ai_usage_log IS 'Registro de uso de APIs de IA para control de costos';

-- =====================================================
-- PARTE 7: VISTA DE RESUMEN DE USO DE IA
-- =====================================================

CREATE OR REPLACE VIEW v_ai_usage_summary AS
SELECT 
    DATE_TRUNC('month', created_at) AS month,
    provider,
    model,
    COUNT(*) AS total_requests,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful_requests,
    SUM(total_tokens) AS total_tokens,
    SUM(estimated_cost) AS total_cost,
    AVG(response_time_ms) AS avg_response_time_ms
FROM ai_usage_log
GROUP BY DATE_TRUNC('month', created_at), provider, model
ORDER BY month DESC, provider, model;

COMMENT ON VIEW v_ai_usage_summary IS 'Resumen mensual de uso de IA por proveedor y modelo';

-- =====================================================
-- PARTE 8: VISTA DE PARSINGS PENDIENTES
-- =====================================================

CREATE OR REPLACE VIEW v_invoice_parsings_pending AS
SELECT 
    ip.id,
    ip.supplier_rut,
    ip.supplier_name,
    ip.document_type,
    ip.invoice_number,
    ip.issue_date,
    ip.total_amount,
    ip.confidence_score,
    ip.status,
    ip.total_items,
    ip.mapped_items,
    ip.unmapped_items,
    ip.created_at,
    u.name AS created_by_name,
    l.name AS location_name,
    CASE 
        WHEN ip.confidence_score >= 0.9 THEN 'HIGH'
        WHEN ip.confidence_score >= 0.7 THEN 'MEDIUM'
        ELSE 'LOW'
    END AS confidence_level
FROM invoice_parsings ip
LEFT JOIN users u ON ip.created_by = u.id
LEFT JOIN locations l ON ip.location_id = l.id
WHERE ip.status IN ('PENDING', 'VALIDATED', 'MAPPING')
ORDER BY 
    CASE ip.status 
        WHEN 'MAPPING' THEN 1
        WHEN 'VALIDATED' THEN 2
        ELSE 3
    END,
    ip.created_at DESC;

COMMENT ON VIEW v_invoice_parsings_pending IS 'Facturas pendientes de procesar ordenadas por prioridad';

-- =====================================================
-- PARTE 9: FUNCIÓN PARA DETECTAR DUPLICADOS
-- =====================================================

CREATE OR REPLACE FUNCTION check_invoice_duplicate(
    p_supplier_rut VARCHAR(20),
    p_invoice_number VARCHAR(50),
    p_file_hash VARCHAR(64)
) RETURNS TABLE (
    is_duplicate BOOLEAN,
    duplicate_id UUID,
    duplicate_status VARCHAR(20),
    match_type VARCHAR(20)
) AS $$
BEGIN
    -- Primero buscar por hash exacto del archivo
    RETURN QUERY
    SELECT 
        true AS is_duplicate,
        ip.id AS duplicate_id,
        ip.status AS duplicate_status,
        'FILE_HASH'::VARCHAR(20) AS match_type
    FROM invoice_parsings ip
    WHERE ip.original_file_hash = p_file_hash
    AND ip.status NOT IN ('REJECTED', 'ERROR')
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
    
    -- Luego buscar por RUT + número de factura
    RETURN QUERY
    SELECT 
        true AS is_duplicate,
        ip.id AS duplicate_id,
        ip.status AS duplicate_status,
        'INVOICE_NUMBER'::VARCHAR(20) AS match_type
    FROM invoice_parsings ip
    WHERE ip.supplier_rut = p_supplier_rut
    AND ip.invoice_number = p_invoice_number
    AND ip.status NOT IN ('REJECTED', 'ERROR')
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
    
    -- También verificar en accounts_payable
    RETURN QUERY
    SELECT 
        true AS is_duplicate,
        ap.id AS duplicate_id,
        ap.status AS duplicate_status,
        'ACCOUNTS_PAYABLE'::VARCHAR(20) AS match_type
    FROM accounts_payable ap
    JOIN suppliers s ON ap.supplier_id = s.id
    WHERE s.rut = p_supplier_rut
    AND ap.invoice_number = p_invoice_number
    AND ap.status != 'CANCELLED'
    LIMIT 1;
    
    IF FOUND THEN RETURN; END IF;
    
    -- No es duplicado
    RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR(20), NULL::VARCHAR(20);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_invoice_duplicate IS 'Detecta si una factura ya fue procesada';

-- =====================================================
-- PARTE 10: CÓDIGOS DE AUDITORÍA
-- =====================================================

-- Nota: Actualizar constraint si las categorías AI, SYSTEM, INVENTORY no están permitidas
-- ALTER TABLE audit_action_catalog DROP CONSTRAINT IF EXISTS chk_audit_category;
-- ALTER TABLE audit_action_catalog ADD CONSTRAINT chk_audit_category 
--     CHECK (category IN ('USER', 'FINANCIAL', 'INVENTORY', 'SYSTEM', 'SECURITY', 'AI', 'POS', 'WMS'));

INSERT INTO audit_action_catalog (code, description, category, severity) VALUES
-- Configuración
('CONFIG_CREATED', 'Configuración del sistema creada', 'SYSTEM', 'LOW'),
('CONFIG_UPDATED', 'Configuración del sistema actualizada', 'SYSTEM', 'MEDIUM'),
('CONFIG_DELETED', 'Configuración del sistema eliminada', 'SYSTEM', 'HIGH'),
('CONFIG_AI_KEY_SET', 'API Key de IA configurada', 'SECURITY', 'HIGH'),

-- Invoice Parsing
('INVOICE_PARSE_STARTED', 'Inicio de parsing de factura con IA', 'AI', 'LOW'),
('INVOICE_PARSE_COMPLETED', 'Parsing de factura completado', 'AI', 'LOW'),
('INVOICE_PARSE_FAILED', 'Error en parsing de factura', 'AI', 'MEDIUM'),
('INVOICE_VALIDATED', 'Factura validada por usuario', 'AI', 'LOW'),
('INVOICE_APPROVED', 'Factura aprobada y procesada', 'AI', 'MEDIUM'),
('INVOICE_REJECTED', 'Factura rechazada', 'AI', 'LOW'),
('INVOICE_DUPLICATE_DETECTED', 'Factura duplicada detectada', 'AI', 'LOW'),

-- Mapeo de productos
('PRODUCT_SKU_MAPPED', 'SKU de proveedor vinculado a producto', 'INVENTORY', 'LOW'),
('PRODUCT_SKU_CREATED', 'Nueva vinculación SKU-producto creada', 'INVENTORY', 'LOW'),

-- IA
('AI_REQUEST_SENT', 'Request enviado a API de IA', 'AI', 'LOW'),
('AI_QUOTA_WARNING', 'Alerta de cuota de IA', 'AI', 'MEDIUM'),
('AI_QUOTA_EXCEEDED', 'Cuota de IA excedida', 'AI', 'HIGH')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- PARTE 11: REGISTRAR MIGRACIÓN
-- =====================================================

-- Nota: Ajustar columnas según estructura real de schema_migrations
-- En Tiger Cloud usa: description, applied_at
INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('009', 'smart_invoice_parsing', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN
-- =====================================================
-- 
-- Para ejecutar esta migración:
-- psql -d farmacias_vallenar -f 009_smart_invoice_parsing.sql
--
-- Variables de entorno requeridas:
-- CONFIG_ENCRYPTION_KEY: Clave de 32 bytes para AES-256
--
-- Después de la migración:
-- 1. Configurar AI_PROVIDER y AI_API_KEY desde la UI
-- 2. Probar con una factura de prueba
-- =====================================================
