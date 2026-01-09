-- =====================================================
-- MIGRACIÓN 008: Cuentas por Pagar (Accounts Payable)
-- Pharma-Synapse v3.1 - Farmacias Vallenar
-- =====================================================
-- Propósito: Gestión de deudas con proveedores
-- Prerrequisito para: Smart Invoice Parsing Module
-- Tiempo estimado: 1-2 minutos
-- No requiere ventana de mantenimiento
-- =====================================================

BEGIN;

-- =====================================================
-- PARTE 1: TABLA PRINCIPAL DE CUENTAS POR PAGAR
-- =====================================================

CREATE TABLE IF NOT EXISTS accounts_payable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vinculación al proveedor (obligatorio)
    supplier_id UUID NOT NULL,
    
    -- Datos de la factura
    invoice_number VARCHAR(50),
    invoice_type VARCHAR(20) DEFAULT 'FACTURA', -- FACTURA, BOLETA, NOTA_CREDITO, GUIA_DESPACHO
    issue_date DATE,
    reception_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    
    -- Montos (en CLP)
    net_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0, -- IVA 19%
    other_taxes NUMERIC(15,2) DEFAULT 0, -- Otros impuestos si aplica
    discount_amount NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL,
    
    -- Pagos realizados
    paid_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Saldo pendiente (columna generada)
    balance NUMERIC(15,2) GENERATED ALWAYS AS 
        (total_amount - paid_amount) STORED,
    
    -- Estado de la cuenta
    status VARCHAR(20) DEFAULT 'PENDING',
    -- PENDING: Pendiente de pago
    -- PARTIAL: Parcialmente pagada
    -- PAID: Pagada completamente
    -- OVERDUE: Vencida
    -- CANCELLED: Anulada
    -- DISPUTED: En disputa
    
    -- Ubicación/Sucursal que debe pagar
    location_id UUID,
    
    -- Vinculación opcional a otros documentos
    purchase_order_id UUID, -- Si viene de una OC
    invoice_parsing_id UUID, -- Si viene del módulo de parsing
    reception_id UUID, -- Si viene de una recepción WMS
    
    -- Categoría de gasto (para reportes)
    expense_category VARCHAR(50) DEFAULT 'INVENTORY',
    -- INVENTORY: Compra de inventario
    -- SERVICES: Servicios (luz, agua, etc.)
    -- RENT: Arriendo
    -- PAYROLL: Nómina
    -- OTHER: Otros
    
    -- Notas y archivos adjuntos
    notes TEXT,
    attachments JSONB, -- URLs de archivos adjuntos
    
    -- Auditoría
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT chk_ap_amounts CHECK (net_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0),
    CONSTRAINT chk_ap_paid CHECK (paid_amount >= 0 AND paid_amount <= total_amount),
    CONSTRAINT chk_ap_status CHECK (status IN ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', 'DISPUTED'))
);

-- Comentarios de documentación
COMMENT ON TABLE accounts_payable IS 'Cuentas por pagar a proveedores - Módulo de Tesorería';
COMMENT ON COLUMN accounts_payable.balance IS 'Saldo pendiente calculado automáticamente';
COMMENT ON COLUMN accounts_payable.expense_category IS 'Categoría para reportes financieros';

-- =====================================================
-- PARTE 2: TABLA DE PAGOS REALIZADOS
-- =====================================================

CREATE TABLE IF NOT EXISTS accounts_payable_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vinculación a la cuenta por pagar
    account_payable_id UUID NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
    
    -- Detalles del pago
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(15,2) NOT NULL,
    
    -- Método de pago
    payment_method VARCHAR(30) NOT NULL,
    -- TRANSFER: Transferencia bancaria
    -- CHECK: Cheque
    -- CASH: Efectivo
    -- CREDIT_NOTE: Nota de crédito
    
    -- Referencia del pago
    reference_number VARCHAR(100), -- N° transferencia, N° cheque, etc.
    bank_account_id UUID, -- Cuenta bancaria de origen
    
    -- Estado
    status VARCHAR(20) DEFAULT 'COMPLETED',
    -- PENDING: Pendiente de confirmación
    -- COMPLETED: Completado
    -- REVERSED: Reversado
    
    -- Auditoría
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    
    -- Constraints
    CONSTRAINT chk_app_amount CHECK (amount > 0),
    CONSTRAINT chk_app_method CHECK (payment_method IN ('TRANSFER', 'CHECK', 'CASH', 'CREDIT_NOTE'))
);

COMMENT ON TABLE accounts_payable_payments IS 'Registro de pagos realizados a cuentas por pagar';

-- =====================================================
-- PARTE 3: ÍNDICES PARA PERFORMANCE
-- =====================================================

-- Índices principales
CREATE INDEX IF NOT EXISTS idx_ap_supplier ON accounts_payable(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ap_status ON accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_ap_due_date ON accounts_payable(due_date);
CREATE INDEX IF NOT EXISTS idx_ap_location ON accounts_payable(location_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoice ON accounts_payable(invoice_number);

-- Índice compuesto para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_ap_supplier_status ON accounts_payable(supplier_id, status);

-- Índice para cuentas vencidas
CREATE INDEX IF NOT EXISTS idx_ap_overdue ON accounts_payable(due_date, status) 
    WHERE status IN ('PENDING', 'PARTIAL');

-- Índices para pagos
CREATE INDEX IF NOT EXISTS idx_app_account ON accounts_payable_payments(account_payable_id);
CREATE INDEX IF NOT EXISTS idx_app_date ON accounts_payable_payments(payment_date);

-- =====================================================
-- PARTE 4: FUNCIÓN PARA ACTUALIZAR ESTADO AUTOMÁTICO
-- =====================================================

CREATE OR REPLACE FUNCTION update_account_payable_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Actualizar paid_amount en accounts_payable
    UPDATE accounts_payable
    SET 
        paid_amount = COALESCE((
            SELECT SUM(amount) 
            FROM accounts_payable_payments 
            WHERE account_payable_id = NEW.account_payable_id 
            AND status = 'COMPLETED'
        ), 0),
        updated_at = NOW()
    WHERE id = NEW.account_payable_id;
    
    -- Actualizar status basado en pagos
    UPDATE accounts_payable
    SET status = CASE
        WHEN paid_amount >= total_amount THEN 'PAID'
        WHEN paid_amount > 0 THEN 'PARTIAL'
        WHEN due_date < CURRENT_DATE AND status NOT IN ('PAID', 'CANCELLED') THEN 'OVERDUE'
        ELSE status
    END
    WHERE id = NEW.account_payable_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar estado después de cada pago
DROP TRIGGER IF EXISTS trg_update_ap_status ON accounts_payable_payments;
CREATE TRIGGER trg_update_ap_status
    AFTER INSERT OR UPDATE OR DELETE ON accounts_payable_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_account_payable_status();

-- =====================================================
-- PARTE 5: FUNCIÓN PARA MARCAR VENCIDAS
-- =====================================================

CREATE OR REPLACE FUNCTION mark_overdue_accounts_payable()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE accounts_payable
    SET status = 'OVERDUE', updated_at = NOW()
    WHERE due_date < CURRENT_DATE
    AND status IN ('PENDING', 'PARTIAL');
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_overdue_accounts_payable IS 'Ejecutar diariamente para marcar cuentas vencidas';

-- =====================================================
-- PARTE 6: VISTA RESUMEN DE CUENTAS POR PAGAR
-- =====================================================

CREATE OR REPLACE VIEW v_accounts_payable_summary AS
SELECT 
    ap.id,
    ap.invoice_number,
    ap.invoice_type,
    s.rut AS supplier_rut,
    COALESCE(s.fantasy_name, s.business_name) AS supplier_name,
    ap.issue_date,
    ap.due_date,
    ap.total_amount,
    ap.paid_amount,
    ap.balance,
    ap.status,
    ap.expense_category,
    l.name AS location_name,
    CASE 
        WHEN ap.due_date < CURRENT_DATE AND ap.status NOT IN ('PAID', 'CANCELLED') 
        THEN CURRENT_DATE - ap.due_date 
        ELSE 0 
    END AS days_overdue,
    ap.created_at
FROM accounts_payable ap
LEFT JOIN suppliers s ON ap.supplier_id = s.id
LEFT JOIN locations l ON ap.location_id = l.id
ORDER BY 
    CASE ap.status 
        WHEN 'OVERDUE' THEN 1 
        WHEN 'PENDING' THEN 2 
        WHEN 'PARTIAL' THEN 3 
        ELSE 4 
    END,
    ap.due_date ASC;

COMMENT ON VIEW v_accounts_payable_summary IS 'Vista resumen de cuentas por pagar con datos de proveedor';

-- =====================================================
-- PARTE 7: VISTA DE AGING (ANTIGÜEDAD DE DEUDA)
-- =====================================================

CREATE OR REPLACE VIEW v_accounts_payable_aging AS
SELECT 
    s.id AS supplier_id,
    COALESCE(s.fantasy_name, s.business_name) AS supplier_name,
    s.rut AS supplier_rut,
    COUNT(*) AS total_invoices,
    SUM(ap.balance) AS total_balance,
    SUM(CASE WHEN ap.due_date >= CURRENT_DATE THEN ap.balance ELSE 0 END) AS current_balance,
    SUM(CASE WHEN ap.due_date < CURRENT_DATE AND ap.due_date >= CURRENT_DATE - 30 THEN ap.balance ELSE 0 END) AS days_1_30,
    SUM(CASE WHEN ap.due_date < CURRENT_DATE - 30 AND ap.due_date >= CURRENT_DATE - 60 THEN ap.balance ELSE 0 END) AS days_31_60,
    SUM(CASE WHEN ap.due_date < CURRENT_DATE - 60 AND ap.due_date >= CURRENT_DATE - 90 THEN ap.balance ELSE 0 END) AS days_61_90,
    SUM(CASE WHEN ap.due_date < CURRENT_DATE - 90 THEN ap.balance ELSE 0 END) AS days_over_90
FROM accounts_payable ap
JOIN suppliers s ON ap.supplier_id = s.id
WHERE ap.status NOT IN ('PAID', 'CANCELLED')
GROUP BY s.id, s.fantasy_name, s.business_name, s.rut
HAVING SUM(ap.balance) > 0
ORDER BY SUM(ap.balance) DESC;

COMMENT ON VIEW v_accounts_payable_aging IS 'Reporte de antigüedad de deuda por proveedor';

-- =====================================================
-- PARTE 8: REGISTRAR MIGRACIÓN
-- =====================================================

-- Nota: Ajustar columnas según estructura real de schema_migrations
-- En Tiger Cloud usa: description, applied_at
INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('008', 'accounts_payable', NOW())
ON CONFLICT (version) DO NOTHING;

-- =====================================================
-- PARTE 9: AUDITORÍA
-- =====================================================

-- Agregar código de acción para auditoría
INSERT INTO audit_action_catalog (code, description, category, severity)
VALUES 
    ('AP_CREATED', 'Cuenta por pagar creada', 'FINANCIAL', 'LOW'),
    ('AP_UPDATED', 'Cuenta por pagar actualizada', 'FINANCIAL', 'LOW'),
    ('AP_PAYMENT', 'Pago registrado a cuenta por pagar', 'FINANCIAL', 'MEDIUM'),
    ('AP_CANCELLED', 'Cuenta por pagar anulada', 'FINANCIAL', 'HIGH'),
    ('AP_APPROVED', 'Cuenta por pagar aprobada', 'FINANCIAL', 'MEDIUM')
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- =====================================================
-- NOTAS DE IMPLEMENTACIÓN
-- =====================================================
-- 
-- Para ejecutar esta migración:
-- psql -d farmacias_vallenar -f 008_accounts_payable.sql
--
-- Para marcar cuentas vencidas (ejecutar diariamente via cron):
-- SELECT mark_overdue_accounts_payable();
--
-- Consultas útiles:
-- SELECT * FROM v_accounts_payable_summary WHERE status = 'OVERDUE';
-- SELECT * FROM v_accounts_payable_aging;
-- =====================================================
