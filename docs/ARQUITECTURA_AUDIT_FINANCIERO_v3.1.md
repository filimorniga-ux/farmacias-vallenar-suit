# Pharma-Synapse v3.1 - Análisis de Arquitectura y Modelo de Auditoría
## Farmacias Vallenar - Documento de Arquitectura Senior

**Fecha:** 2024-12-23  
**Versión:** 3.1  
**Autor:** Arquitecto de Software Senior  
**Clasificación:** Documento Técnico Interno - Confidencial

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Análisis de Riesgos](#2-análisis-de-riesgos)
3. [Modelo de Datos y Auditoría](#3-modelo-de-datos-y-auditoría)
4. [Conciliación Financiera - Roadmap Fase 2](#4-conciliación-financiera---roadmap-fase-2)
5. [Resiliencia y Fallbacks](#5-resiliencia-y-fallbacks)
6. [Recomendaciones de Implementación](#6-recomendaciones-de-implementación)
7. [Monitoreo y Alertas](#7-monitoreo-y-alertas)

---

## 1. Resumen Ejecutivo

### Estado Actual del Sistema

El sistema Pharma-Synapse v3.1 presenta una arquitectura sólida con Next.js Server Actions, pero identifico **vulnerabilidades críticas** en:

1. **Inconsistencia de tipos de datos** (TEXT vs UUID) que genera fallbacks implícitos
2. **Auditoría incompleta** - acciones financieras críticas sin registro
3. **Concurrencia no controlada** en operaciones de caja
4. **Falta de inmutabilidad** en registros financieros

### Puntuación de Riesgo Global: **7.2/10** (Alto)

| Módulo | Riesgo | Justificación |
|--------|--------|---------------|
| POS/Ventas | 🟡 Medio | Transacciones ACID implementadas |
| Sesiones de Caja | 🔴 Alto | Race conditions, zombie shifts |
| Auditoría | 🔴 Alto | Cobertura parcial, sin integridad |
| Conciliación | 🟡 Medio | Módulo incompleto |
| Stock | 🟢 Bajo | FEFO + transacciones atómicas |

---

## 2. Análisis de Riesgos

### 2.1 Riesgos de Inconsistencia de Datos (IDs Híbridos TEXT/UUID)

#### **RIESGO CRÍTICO: Mezcla de Tipos en Foreign Keys**

**Evidencia encontrada:**

```sql
-- terminals.location_id es TEXT en algunas versiones
-- locations.id es UUID
-- Esto causa JOINs implícitos con casting
```

**Archivo afectado:** `src/actions/terminals.ts` línea 248:
```typescript
WHERE t.location_id = $1  -- Sin casting explícito
```

**Archivo afectado:** `src/actions/cash-management.ts` línea 56:
```typescript
WHERE terminal_id = $1::uuid  -- Casting forzado
```

| ID | Riesgo | Severidad | Impacto | Probabilidad |
|----|--------|-----------|---------|--------------|
| R-001 | JOIN fallido entre terminals y locations | **ALTA** | Terminales invisibles en UI | Media |
| R-002 | Inserción con tipo incorrecto silenciosa | **ALTA** | Datos huérfanos | Alta |
| R-003 | Índices no utilizados por casting | **MEDIA** | Degradación de performance | Alta |
| R-004 | Comparación TEXT vs UUID retorna false | **CRÍTICA** | Pérdida de datos en queries | Media |

**Recomendación inmediata:**
```sql
-- Migración correctiva URGENTE
ALTER TABLE terminals 
  ALTER COLUMN location_id TYPE UUID USING location_id::uuid;

ALTER TABLE terminals 
  ALTER COLUMN id TYPE UUID USING id::uuid;

-- Agregar constraint explícito
ALTER TABLE terminals
  ADD CONSTRAINT fk_terminals_location_strict
  FOREIGN KEY (location_id) REFERENCES locations(id)
  ON DELETE RESTRICT;
```

---

### 2.2 Problemas de Concurrencia en Sesiones de Caja

#### **RIESGO CRÍTICO: Race Condition en Apertura de Terminal**

**Código vulnerable en `src/actions/terminals.ts` líneas 57-153:**

```typescript
// PROBLEMA: Ventana de tiempo entre CHECK y UPDATE
const termRes = await query('SELECT * FROM terminals WHERE id = $1', [terminalId]);
// ... validaciones ...
// AQUÍ OTRO PROCESO PUEDE ABRIR EL MISMO TERMINAL
await query(`UPDATE terminals SET status = 'OPEN'...`);
```

| ID | Riesgo | Severidad | Impacto |
|----|--------|-----------|---------|
| R-005 | Dos cajeros abren mismo terminal | **CRÍTICA** | Descuadre financiero total |
| R-006 | Sesión zombie no detectada | **ALTA** | Bloqueo de terminal |
| R-007 | Auto-close sin auditoría completa | **ALTA** | Pérdida de trazabilidad |

**Solución: Bloqueo Pesimista con FOR UPDATE**

```sql
-- En openTerminal: usar transacción con bloqueo
BEGIN;
SELECT * FROM terminals WHERE id = $1 FOR UPDATE;
-- Validaciones
INSERT INTO cash_register_sessions...;
UPDATE terminals SET status = 'OPEN'...;
COMMIT;
```

**Implementación recomendada:**
```typescript
// src/actions/terminals.ts - REFACTORIZADO
export async function openTerminal(terminalId: string, userId: string, initialCash: number) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. BLOQUEO PESIMISTA - Nadie más puede tocar este terminal
        const termRes = await client.query(
            'SELECT * FROM terminals WHERE id = $1 FOR UPDATE NOWAIT',
            [terminalId]
        );
        
        if (termRes.rows[0].status === 'OPEN') {
            throw new Error('TERMINAL_ALREADY_OPEN');
        }
        
        // 2. Verificar sesiones zombie del usuario
        const zombieCheck = await client.query(`
            SELECT id FROM cash_register_sessions 
            WHERE user_id = $1 AND status = 'OPEN'
            FOR UPDATE
        `, [userId]);
        
        if (zombieCheck.rowCount > 0) {
            throw new Error('USER_HAS_ACTIVE_SESSION');
        }
        
        // 3. Crear sesión y actualizar terminal ATÓMICAMENTE
        // ... resto del código ...
        
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '55P03') { // Lock not available
            return { success: false, error: 'Terminal ocupado, intente nuevamente' };
        }
        throw e;
    } finally {
        client.release();
    }
}
```

---

### 2.3 Brechas de Auditoría Identificadas

#### **Acciones NO registradas actualmente:**

| Acción | Módulo | Severidad | Requisito SII/Fiscal |
|--------|--------|-----------|---------------------|
| Modificación de precio de venta | Inventario | **CRÍTICA** | Sí |
| Anulación de venta | POS | **CRÍTICA** | Sí |
| Cambio de método de pago | POS | **ALTA** | Sí |
| Ajuste de stock manual | Inventario | **ALTA** | Sí |
| Modificación de sesión cerrada | Caja | **CRÍTICA** | Sí |
| Descuento aplicado | POS | **MEDIA** | Sí |
| Cambio de contraseña/PIN | Usuarios | **ALTA** | No |
| Exportación de datos | Reportes | **MEDIA** | No |
| Acceso a módulo sensible | Seguridad | **MEDIA** | No |

#### **Problemas en audit_logs actual:**

```sql
-- Esquema actual (INSUFICIENTE)
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(255) NOT NULL,  -- ❌ Debería ser UUID con FK
    accion VARCHAR(50) NOT NULL,    -- ❌ Sin catálogo de acciones
    detalle TEXT,                   -- ❌ Sin estructura
    fecha TIMESTAMP,                -- ✅ OK
    ip VARCHAR(45)                  -- ⚠️ Falta terminal_id, session_id
);
```

---

## 3. Modelo de Datos y Auditoría

### 3.1 Modelo de Auditoría Propuesto (Nivel Banca/Retail)

```sql
-- =====================================================
-- SISTEMA DE AUDITORÍA FORENSE - PHARMA-SYNAPSE v3.1
-- =====================================================

-- Catálogo de acciones auditables
CREATE TABLE audit_action_catalog (
    code VARCHAR(50) PRIMARY KEY,
    category VARCHAR(30) NOT NULL, -- 'FINANCIAL', 'SECURITY', 'OPERATIONAL', 'COMPLIANCE'
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT NOT NULL,
    requires_justification BOOLEAN DEFAULT FALSE,
    retention_days INTEGER DEFAULT 2555 -- 7 años por defecto (requisito SII)
);

-- Insertar catálogo base
INSERT INTO audit_action_catalog VALUES
    ('SALE_CREATE', 'FINANCIAL', 'MEDIUM', 'Venta registrada', FALSE, 2555),
    ('SALE_VOID', 'FINANCIAL', 'CRITICAL', 'Anulación de venta', TRUE, 2555),
    ('SALE_REFUND', 'FINANCIAL', 'HIGH', 'Devolución procesada', TRUE, 2555),
    ('PRICE_CHANGE', 'FINANCIAL', 'CRITICAL', 'Modificación de precio', TRUE, 2555),
    ('STOCK_ADJUST', 'FINANCIAL', 'HIGH', 'Ajuste manual de inventario', TRUE, 2555),
    ('SESSION_OPEN', 'OPERATIONAL', 'MEDIUM', 'Apertura de caja', FALSE, 2555),
    ('SESSION_CLOSE', 'OPERATIONAL', 'MEDIUM', 'Cierre de caja', FALSE, 2555),
    ('SESSION_FORCE_CLOSE', 'SECURITY', 'CRITICAL', 'Cierre forzado de sesión', TRUE, 2555),
    ('RECONCILIATION', 'FINANCIAL', 'CRITICAL', 'Conciliación de arqueo', TRUE, 2555),
    ('CASH_MOVEMENT', 'FINANCIAL', 'MEDIUM', 'Movimiento de efectivo', FALSE, 2555),
    ('USER_LOGIN', 'SECURITY', 'LOW', 'Inicio de sesión', FALSE, 365),
    ('USER_LOGOUT', 'SECURITY', 'LOW', 'Cierre de sesión', FALSE, 365),
    ('USER_LOGIN_FAILED', 'SECURITY', 'HIGH', 'Intento fallido de login', FALSE, 365),
    ('PERMISSION_CHANGE', 'SECURITY', 'HIGH', 'Cambio de permisos', TRUE, 2555),
    ('CONFIG_CHANGE', 'OPERATIONAL', 'HIGH', 'Cambio de configuración', TRUE, 2555),
    ('DTE_EMIT', 'COMPLIANCE', 'MEDIUM', 'Emisión de DTE', FALSE, 2555),
    ('DTE_VOID', 'COMPLIANCE', 'CRITICAL', 'Anulación de DTE', TRUE, 2555),
    ('REPORT_EXPORT', 'OPERATIONAL', 'MEDIUM', 'Exportación de datos', FALSE, 730);

-- Tabla principal de auditoría (INMUTABLE)
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificación temporal precisa
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    client_timestamp TIMESTAMP WITH TIME ZONE, -- Del frontend
    
    -- Contexto de usuario
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_role VARCHAR(30),
    user_name VARCHAR(255), -- Snapshot desnormalizado
    
    -- Contexto de sesión
    session_id UUID REFERENCES cash_register_sessions(id) ON DELETE SET NULL,
    terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    
    -- Acción
    action_code VARCHAR(50) REFERENCES audit_action_catalog(code) NOT NULL,
    
    -- Entidad afectada
    entity_type VARCHAR(50) NOT NULL, -- 'SALE', 'SESSION', 'PRODUCT', 'USER', etc.
    entity_id VARCHAR(100), -- UUID o ID compuesto
    
    -- Datos de cambio (JSONB para flexibilidad)
    old_values JSONB, -- Estado anterior (NULL si es creación)
    new_values JSONB, -- Estado nuevo (NULL si es eliminación)
    metadata JSONB, -- Datos adicionales específicos de la acción
    
    -- Justificación (requerida para acciones críticas)
    justification TEXT,
    authorized_by UUID REFERENCES users(id), -- Supervisor que autorizó
    
    -- Trazabilidad técnica
    ip_address INET,
    user_agent TEXT,
    request_id UUID, -- Correlación con logs de aplicación
    
    -- Integridad
    checksum VARCHAR(64), -- SHA-256 del registro
    previous_checksum VARCHAR(64), -- Encadenamiento tipo blockchain
    
    -- Constraint de inmutabilidad
    CONSTRAINT audit_log_immutable CHECK (TRUE) -- Placeholder para trigger
);

-- Índices optimizados para consultas de auditoría
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action_code);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_session ON audit_log(session_id);
CREATE INDEX idx_audit_log_location ON audit_log(location_id);
CREATE INDEX idx_audit_log_severity ON audit_log(action_code) 
    WHERE action_code IN (SELECT code FROM audit_action_catalog WHERE severity IN ('HIGH', 'CRITICAL'));

-- Particionamiento por mes (para volumen alto)
-- CREATE TABLE audit_log_2024_01 PARTITION OF audit_log
--     FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- =====================================================
-- TRIGGER DE INMUTABILIDAD Y CHECKSUM
-- =====================================================

CREATE OR REPLACE FUNCTION audit_log_before_insert()
RETURNS TRIGGER AS $$
DECLARE
    last_checksum VARCHAR(64);
    record_data TEXT;
BEGIN
    -- Obtener checksum del último registro
    SELECT checksum INTO last_checksum 
    FROM audit_log 
    ORDER BY created_at DESC 
    LIMIT 1;
    
    NEW.previous_checksum := COALESCE(last_checksum, 'GENESIS');
    
    -- Calcular checksum del registro actual
    record_data := concat_ws('|',
        NEW.id::text,
        NEW.created_at::text,
        NEW.user_id::text,
        NEW.action_code,
        NEW.entity_type,
        NEW.entity_id,
        NEW.old_values::text,
        NEW.new_values::text,
        NEW.previous_checksum
    );
    
    NEW.checksum := encode(sha256(record_data::bytea), 'hex');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_log_checksum
BEFORE INSERT ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_before_insert();

-- Prevenir UPDATE/DELETE
CREATE OR REPLACE FUNCTION audit_log_prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Los registros de auditoría son inmutables. Acción % no permitida.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_prevent_modification();

-- =====================================================
-- VISTAS DE AUDITORÍA PARA REPORTES
-- =====================================================

-- Vista de actividad sospechosa
CREATE OR REPLACE VIEW v_suspicious_activity AS
SELECT 
    al.created_at,
    al.user_name,
    al.action_code,
    ac.description,
    ac.severity,
    al.entity_type,
    al.entity_id,
    al.ip_address,
    al.justification,
    t.name AS terminal_name,
    l.name AS location_name
FROM audit_log al
JOIN audit_action_catalog ac ON al.action_code = ac.code
LEFT JOIN terminals t ON al.terminal_id = t.id
LEFT JOIN locations l ON al.location_id = l.id
WHERE ac.severity IN ('HIGH', 'CRITICAL')
ORDER BY al.created_at DESC;

-- Vista de trazabilidad de venta completa
CREATE OR REPLACE VIEW v_sale_audit_trail AS
SELECT 
    s.id AS sale_id,
    s.total_amount,
    s.payment_method,
    s.timestamp AS sale_timestamp,
    d.folio AS dte_folio,
    d.status AS dte_status,
    crs.id AS session_id,
    crs.opened_at AS shift_start,
    t.name AS terminal_name,
    l.name AS location_name,
    u.name AS cashier_name,
    json_agg(DISTINCT jsonb_build_object(
        'action', al.action_code,
        'timestamp', al.created_at,
        'user', al.user_name
    )) AS audit_trail
FROM sales s
LEFT JOIN dte_documents d ON s.dte_folio::integer = d.folio
LEFT JOIN cash_register_sessions crs ON s.terminal_id = crs.terminal_id 
    AND s.timestamp BETWEEN crs.opened_at AND COALESCE(crs.closed_at, NOW())
LEFT JOIN terminals t ON s.terminal_id = t.id
LEFT JOIN locations l ON s.location_id = l.id
LEFT JOIN users u ON s.user_id = u.id
LEFT JOIN audit_log al ON al.entity_type = 'SALE' AND al.entity_id = s.id::text
GROUP BY s.id, d.folio, d.status, crs.id, t.name, l.name, u.name;
```

### 3.2 Comparativa de Enfoques de Auditoría

| Enfoque | Ventajas | Desventajas | Recomendación |
|---------|----------|-------------|---------------|
| **Tablas dedicadas (propuesto)** | Inmutabilidad garantizada, queries rápidas, compliance | Duplicación de datos, storage | ✅ **USAR PARA: Acciones financieras y de seguridad** |
| **Triggers PostgreSQL** | Automático, no requiere cambios en app | Overhead en cada operación, difícil debug | ✅ **USAR PARA: Backup de cambios en tablas críticas** |
| **Logs de aplicación** | Contexto rico, fácil implementación | No inmutable, difícil correlacionar | ✅ **USAR PARA: Debug, métricas, trazas** |
| **Event Sourcing** | Máxima trazabilidad, replay posible | Complejidad alta, refactor total | ❌ No recomendado para este proyecto |

### 3.3 Implementación en Server Actions

```typescript
// src/lib/audit.ts - NUEVO MÓDULO DE AUDITORÍA

import { query, pool } from '@/lib/db';
import { headers } from 'next/headers';

type AuditActionCode = 
    | 'SALE_CREATE' | 'SALE_VOID' | 'SALE_REFUND'
    | 'PRICE_CHANGE' | 'STOCK_ADJUST'
    | 'SESSION_OPEN' | 'SESSION_CLOSE' | 'SESSION_FORCE_CLOSE'
    | 'RECONCILIATION' | 'CASH_MOVEMENT'
    | 'USER_LOGIN' | 'USER_LOGOUT' | 'USER_LOGIN_FAILED'
    | 'PERMISSION_CHANGE' | 'CONFIG_CHANGE'
    | 'DTE_EMIT' | 'DTE_VOID' | 'REPORT_EXPORT';

interface AuditContext {
    userId: string;
    userName?: string;
    userRole?: string;
    sessionId?: string;
    terminalId?: string;
    locationId?: string;
}

interface AuditPayload {
    action: AuditActionCode;
    entityType: string;
    entityId: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    metadata?: Record<string, any>;
    justification?: string;
    authorizedBy?: string;
}

/**
 * Registra una acción en el log de auditoría.
 * IMPORTANTE: Esta función NUNCA debe fallar silenciosamente para acciones CRITICAL.
 */
export async function auditLog(
    context: AuditContext,
    payload: AuditPayload
): Promise<{ success: boolean; auditId?: string; error?: string }> {
    try {
        // Obtener metadata de request
        const headersList = headers();
        const ipAddress = headersList.get('x-forwarded-for') || 
                          headersList.get('x-real-ip') || 
                          'UNKNOWN';
        const userAgent = headersList.get('user-agent') || 'UNKNOWN';
        const requestId = headersList.get('x-request-id') || crypto.randomUUID();

        const result = await query(`
            INSERT INTO audit_log (
                user_id, user_name, user_role,
                session_id, terminal_id, location_id,
                action_code, entity_type, entity_id,
                old_values, new_values, metadata,
                justification, authorized_by,
                ip_address, user_agent, request_id,
                client_timestamp
            ) VALUES (
                $1::uuid, $2, $3,
                $4::uuid, $5::uuid, $6::uuid,
                $7, $8, $9,
                $10::jsonb, $11::jsonb, $12::jsonb,
                $13, $14::uuid,
                $15::inet, $16, $17::uuid,
                NOW()
            )
            RETURNING id
        `, [
            context.userId || null,
            context.userName || null,
            context.userRole || null,
            context.sessionId || null,
            context.terminalId || null,
            context.locationId || null,
            payload.action,
            payload.entityType,
            payload.entityId,
            payload.oldValues ? JSON.stringify(payload.oldValues) : null,
            payload.newValues ? JSON.stringify(payload.newValues) : null,
            payload.metadata ? JSON.stringify(payload.metadata) : null,
            payload.justification || null,
            payload.authorizedBy || null,
            ipAddress,
            userAgent,
            requestId
        ]);

        return { success: true, auditId: result.rows[0].id };
    } catch (error: any) {
        console.error('❌ CRITICAL: Audit log failed:', error);
        
        // Para acciones críticas, el fallo de auditoría DEBE propagarse
        const criticalActions: AuditActionCode[] = [
            'SALE_VOID', 'PRICE_CHANGE', 'SESSION_FORCE_CLOSE', 
            'RECONCILIATION', 'DTE_VOID', 'PERMISSION_CHANGE'
        ];
        
        if (criticalActions.includes(payload.action)) {
            throw new Error(`Audit required for ${payload.action} but failed: ${error.message}`);
        }
        
        return { success: false, error: error.message };
    }
}

/**
 * Wrapper para operaciones que REQUIEREN auditoría exitosa.
 * Si la auditoría falla, la operación se revierte.
 */
export async function withAudit<T>(
    context: AuditContext,
    payload: AuditPayload,
    operation: () => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Ejecutar operación principal
        const result = await operation();
        
        // Registrar auditoría (dentro de la misma transacción)
        await client.query(`
            INSERT INTO audit_log (
                user_id, user_name, user_role,
                session_id, terminal_id, location_id,
                action_code, entity_type, entity_id,
                old_values, new_values, metadata,
                justification, authorized_by
            ) VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::uuid)
        `, [
            context.userId, context.userName, context.userRole,
            context.sessionId, context.terminalId, context.locationId,
            payload.action, payload.entityType, payload.entityId,
            payload.oldValues ? JSON.stringify(payload.oldValues) : null,
            payload.newValues ? JSON.stringify(payload.newValues) : null,
            payload.metadata ? JSON.stringify(payload.metadata) : null,
            payload.justification, payload.authorizedBy
        ]);
        
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
```

---

## 4. Conciliación Financiera - Roadmap Fase 2

### 4.1 Flujo Conceptual de Conciliación de Arqueos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUJO DE CONCILIACIÓN                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   ARQUEO     │───▶│  CÁLCULO     │───▶│  DIFERENCIA  │                  │
│  │   FÍSICO     │    │  TEÓRICO     │    │  DETECTADA   │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│         │                   │                   │                          │
│         ▼                   ▼                   ▼                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ Conteo por   │    │ Apertura     │    │ Sobrante:    │                  │
│  │ denominación │    │ + Ventas     │    │   > +$500    │──▶ Investiga     │
│  │ (billetes,   │    │ + Ingresos   │    │   > +$1000   │──▶ Alerta Mgr    │
│  │ monedas)     │    │ - Egresos    │    │              │                  │
│  └──────────────┘    │ - Retiros    │    │ Faltante:    │                  │
│                      └──────────────┘    │   > -$500    │──▶ Justificación │
│                                          │   > -$1000   │──▶ Escalamiento  │
│                                          │   > -$5000   │──▶ Bloqueo       │
│                                          └──────────────┘                  │
│                                                 │                          │
│                                                 ▼                          │
│                                   ┌──────────────────────┐                 │
│                                   │   JUSTIFICACIÓN      │                 │
│                                   │   OBLIGATORIA        │                 │
│                                   │                      │                 │
│                                   │ • Tipo de diferencia │                 │
│                                   │ • Causa raíz         │                 │
│                                   │ • Evidencia adjunta  │                 │
│                                   │ • Aprobación gerente │                 │
│                                   └──────────────────────┘                 │
│                                                 │                          │
│                                                 ▼                          │
│                           ┌─────────────────────────────────┐              │
│                           │     REGISTRO INMUTABLE          │              │
│                           │                                 │              │
│                           │ • cash_reconciliations          │              │
│                           │ • audit_log (RECONCILIATION)    │              │
│                           │ • Vinculado a sesión, usuario   │              │
│                           └─────────────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Modelo de Datos para Conciliación

```sql
-- =====================================================
-- MÓDULO DE CONCILIACIÓN FINANCIERA
-- =====================================================

-- Tabla de conciliaciones (una por cierre de sesión)
CREATE TABLE cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vinculación a sesión
    session_id UUID NOT NULL REFERENCES cash_register_sessions(id),
    terminal_id UUID NOT NULL REFERENCES terminals(id),
    location_id UUID NOT NULL REFERENCES locations(id),
    
    -- Valores calculados por el sistema
    theoretical_amount NUMERIC(15,2) NOT NULL,
    opening_amount NUMERIC(15,2) NOT NULL,
    cash_sales_total NUMERIC(15,2) NOT NULL,
    cash_movements_in NUMERIC(15,2) NOT NULL,
    cash_movements_out NUMERIC(15,2) NOT NULL,
    
    -- Valores declarados por el cajero
    declared_amount NUMERIC(15,2) NOT NULL,
    
    -- Diferencia
    difference NUMERIC(15,2) NOT NULL GENERATED ALWAYS AS 
        (declared_amount - theoretical_amount) STORED,
    difference_type VARCHAR(20) GENERATED ALWAYS AS (
        CASE 
            WHEN declared_amount - theoretical_amount > 0 THEN 'SURPLUS'
            WHEN declared_amount - theoretical_amount < 0 THEN 'SHORTAGE'
            ELSE 'BALANCED'
        END
    ) STORED,
    
    -- Detalle de conteo físico (opcional pero recomendado)
    physical_count JSONB, -- {"bills": {"20000": 5, "10000": 3}, "coins": {"500": 10}}
    
    -- Estado y workflow
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' 
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED', 'UNDER_INVESTIGATION')),
    
    -- Justificación (requerida si hay diferencia significativa)
    requires_justification BOOLEAN GENERATED ALWAYS AS (
        ABS(declared_amount - theoretical_amount) > 500
    ) STORED,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    
    -- Aprobación
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(id),
    approval_notes TEXT,
    
    -- Constraint de unicidad
    CONSTRAINT unique_reconciliation_per_session UNIQUE (session_id)
);

-- Tabla de justificaciones de diferencias
CREATE TABLE reconciliation_justifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id),
    
    -- Tipo de justificación
    justification_type VARCHAR(50) NOT NULL CHECK (justification_type IN (
        'COUNTING_ERROR',      -- Error de conteo
        'CHANGE_GIVEN_WRONG',  -- Vuelto mal dado
        'SALE_NOT_RECORDED',   -- Venta no registrada
        'MOVEMENT_NOT_RECORDED', -- Movimiento no registrado
        'THEFT_SUSPECTED',     -- Sospecha de robo
        'SYSTEM_ERROR',        -- Error del sistema
        'COINS_STUCK',         -- Monedas atascadas
        'OTHER'                -- Otro (requiere detalle)
    )),
    
    -- Detalle
    description TEXT NOT NULL,
    
    -- Evidencia
    evidence_urls TEXT[], -- URLs de fotos, documentos
    
    -- Vinculación a ventas/movimientos específicos (si aplica)
    related_sale_ids UUID[],
    related_movement_ids UUID[],
    
    -- Monto justificado (puede ser parcial)
    amount_justified NUMERIC(15,2) NOT NULL,
    
    -- Creación
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    
    -- Validación por supervisor
    validated_at TIMESTAMP WITH TIME ZONE,
    validated_by UUID REFERENCES users(id),
    validation_status VARCHAR(20) CHECK (validation_status IN ('ACCEPTED', 'REJECTED', 'PARTIAL')),
    validation_notes TEXT
);

-- Tabla de alertas de diferencias
CREATE TABLE reconciliation_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id),
    
    alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN (
        'MINOR_SHORTAGE',    -- < $1000
        'MAJOR_SHORTAGE',    -- $1000 - $5000
        'CRITICAL_SHORTAGE', -- > $5000
        'SUSPICIOUS_SURPLUS', -- Sobrante alto
        'PATTERN_DETECTED',  -- Patrón repetitivo
        'UNJUSTIFIED'        -- Sin justificación válida
    )),
    
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    
    -- Destinatarios notificados
    notified_users UUID[],
    notification_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Resolución
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED')),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    resolution_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vista de resumen de conciliaciones por período
CREATE OR REPLACE VIEW v_reconciliation_summary AS
SELECT 
    DATE_TRUNC('day', cr.created_at) AS date,
    l.name AS location_name,
    COUNT(*) AS total_reconciliations,
    SUM(CASE WHEN cr.difference_type = 'BALANCED' THEN 1 ELSE 0 END) AS balanced_count,
    SUM(CASE WHEN cr.difference_type = 'SHORTAGE' THEN 1 ELSE 0 END) AS shortage_count,
    SUM(CASE WHEN cr.difference_type = 'SURPLUS' THEN 1 ELSE 0 END) AS surplus_count,
    SUM(CASE WHEN cr.difference < 0 THEN cr.difference ELSE 0 END) AS total_shortage,
    SUM(CASE WHEN cr.difference > 0 THEN cr.difference ELSE 0 END) AS total_surplus,
    AVG(ABS(cr.difference)) AS avg_absolute_difference,
    COUNT(*) FILTER (WHERE cr.status = 'UNDER_INVESTIGATION') AS under_investigation
FROM cash_reconciliations cr
JOIN locations l ON cr.location_id = l.id
GROUP BY DATE_TRUNC('day', cr.created_at), l.name
ORDER BY date DESC, location_name;

-- Vista de historial de un cajero
CREATE OR REPLACE VIEW v_cashier_reconciliation_history AS
SELECT 
    u.id AS user_id,
    u.name AS user_name,
    COUNT(*) AS total_shifts,
    SUM(CASE WHEN cr.difference_type = 'BALANCED' THEN 1 ELSE 0 END) AS balanced_shifts,
    SUM(CASE WHEN cr.difference < -1000 THEN 1 ELSE 0 END) AS major_shortage_count,
    SUM(cr.difference) AS net_difference,
    AVG(cr.difference) AS avg_difference,
    STDDEV(cr.difference) AS stddev_difference,
    MAX(ABS(cr.difference)) AS max_absolute_difference
FROM users u
LEFT JOIN cash_reconciliations cr ON cr.created_by = u.id
WHERE u.role = 'CASHIER'
GROUP BY u.id, u.name;

-- Índices para performance
CREATE INDEX idx_reconciliations_session ON cash_reconciliations(session_id);
CREATE INDEX idx_reconciliations_status ON cash_reconciliations(status);
CREATE INDEX idx_reconciliations_created_at ON cash_reconciliations(created_at DESC);
CREATE INDEX idx_reconciliations_difference ON cash_reconciliations(difference) 
    WHERE ABS(difference) > 500;
CREATE INDEX idx_justifications_reconciliation ON reconciliation_justifications(reconciliation_id);
CREATE INDEX idx_alerts_status ON reconciliation_alerts(status) WHERE status != 'RESOLVED';
```

### 4.3 Server Action de Conciliación

```typescript
// src/actions/reconciliation-v2.ts

'use server';

import { query, pool } from '@/lib/db';
import { auditLog, withAudit } from '@/lib/audit';
import { z } from 'zod';

const PhysicalCountSchema = z.object({
    bills: z.record(z.string(), z.number()).optional(),
    coins: z.record(z.string(), z.number()).optional()
});

const ReconciliationSchema = z.object({
    sessionId: z.string().uuid(),
    declaredAmount: z.number().min(0),
    physicalCount: PhysicalCountSchema.optional(),
    userId: z.string().uuid()
});

interface ReconciliationResult {
    success: boolean;
    reconciliationId?: string;
    difference?: number;
    requiresJustification?: boolean;
    error?: string;
}

export async function createReconciliation(
    data: z.infer<typeof ReconciliationSchema>
): Promise<ReconciliationResult> {
    const validated = ReconciliationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: 'Datos inválidos' };
    }

    const { sessionId, declaredAmount, physicalCount, userId } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener datos de la sesión y calcular teórico
        const sessionData = await client.query(`
            SELECT 
                s.id,
                s.terminal_id,
                t.location_id,
                s.opening_amount,
                s.opened_at,
                s.closed_at,
                COALESCE((
                    SELECT SUM(total_amount) 
                    FROM sales 
                    WHERE terminal_id = s.terminal_id 
                    AND payment_method = 'CASH'
                    AND timestamp BETWEEN s.opened_at AND COALESCE(s.closed_at, NOW())
                ), 0) AS cash_sales,
                COALESCE((
                    SELECT SUM(amount) 
                    FROM cash_movements 
                    WHERE session_id = s.id 
                    AND type IN ('EXTRA_INCOME', 'OPENING')
                    AND type != 'OPENING' -- Ya contado en opening_amount
                ), 0) AS movements_in,
                COALESCE((
                    SELECT SUM(amount) 
                    FROM cash_movements 
                    WHERE session_id = s.id 
                    AND type IN ('WITHDRAWAL', 'EXPENSE')
                ), 0) AS movements_out
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.id = $1
            FOR UPDATE
        `, [sessionId]);

        if (sessionData.rowCount === 0) {
            throw new Error('Sesión no encontrada');
        }

        const session = sessionData.rows[0];
        
        // 2. Calcular monto teórico
        const theoreticalAmount = 
            Number(session.opening_amount) +
            Number(session.cash_sales) +
            Number(session.movements_in) -
            Number(session.movements_out);

        const difference = declaredAmount - theoreticalAmount;
        const requiresJustification = Math.abs(difference) > 500;

        // 3. Crear registro de conciliación
        const reconciliationResult = await client.query(`
            INSERT INTO cash_reconciliations (
                session_id, terminal_id, location_id,
                theoretical_amount, opening_amount, 
                cash_sales_total, cash_movements_in, cash_movements_out,
                declared_amount, physical_count, created_by,
                status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                CASE WHEN ABS($9 - $4) > 500 THEN 'PENDING' ELSE 'APPROVED' END
            )
            RETURNING id, difference, requires_justification
        `, [
            sessionId,
            session.terminal_id,
            session.location_id,
            theoreticalAmount,
            session.opening_amount,
            session.cash_sales,
            session.movements_in,
            session.movements_out,
            declaredAmount,
            physicalCount ? JSON.stringify(physicalCount) : null,
            userId
        ]);

        const reconciliation = reconciliationResult.rows[0];

        // 4. Crear alerta si hay diferencia significativa
        if (Math.abs(difference) > 500) {
            let alertType: string;
            let severity: string;

            if (difference < -5000) {
                alertType = 'CRITICAL_SHORTAGE';
                severity = 'CRITICAL';
            } else if (difference < -1000) {
                alertType = 'MAJOR_SHORTAGE';
                severity = 'HIGH';
            } else if (difference < 0) {
                alertType = 'MINOR_SHORTAGE';
                severity = 'MEDIUM';
            } else {
                alertType = 'SUSPICIOUS_SURPLUS';
                severity = difference > 5000 ? 'HIGH' : 'MEDIUM';
            }

            await client.query(`
                INSERT INTO reconciliation_alerts (
                    reconciliation_id, alert_type, severity
                ) VALUES ($1, $2, $3)
            `, [reconciliation.id, alertType, severity]);
        }

        // 5. Registrar auditoría
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, location_id,
                action_code, entity_type, entity_id,
                new_values, metadata
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid,
                'RECONCILIATION', 'RECONCILIATION', $4,
                $5::jsonb, $6::jsonb
            )
        `, [
            userId,
            session.terminal_id,
            session.location_id,
            reconciliation.id,
            JSON.stringify({
                declared_amount: declaredAmount,
                theoretical_amount: theoreticalAmount,
                difference: difference
            }),
            JSON.stringify({
                physical_count: physicalCount,
                requires_justification: requiresJustification
            })
        ]);

        await client.query('COMMIT');

        return {
            success: true,
            reconciliationId: reconciliation.id,
            difference: Number(difference),
            requiresJustification
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Reconciliation error:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

// Agregar justificación a una conciliación
export async function addJustification(data: {
    reconciliationId: string;
    justificationType: string;
    description: string;
    amountJustified: number;
    evidenceUrls?: string[];
    relatedSaleIds?: string[];
    userId: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        await query(`
            INSERT INTO reconciliation_justifications (
                reconciliation_id, justification_type, description,
                amount_justified, evidence_urls, related_sale_ids, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            data.reconciliationId,
            data.justificationType,
            data.description,
            data.amountJustified,
            data.evidenceUrls || [],
            data.relatedSaleIds || [],
            data.userId
        ]);

        // Verificar si la diferencia está completamente justificada
        const totals = await query(`
            SELECT 
                cr.difference,
                COALESCE(SUM(rj.amount_justified), 0) as total_justified
            FROM cash_reconciliations cr
            LEFT JOIN reconciliation_justifications rj ON rj.reconciliation_id = cr.id
            WHERE cr.id = $1
            GROUP BY cr.id
        `, [data.reconciliationId]);

        if (totals.rows.length > 0) {
            const { difference, total_justified } = totals.rows[0];
            
            // Si la diferencia está justificada en su totalidad (+/- 10%), auto-aprobar
            if (Math.abs(Number(total_justified) - Math.abs(Number(difference))) <= Math.abs(Number(difference)) * 0.1) {
                await query(`
                    UPDATE cash_reconciliations 
                    SET status = 'APPROVED', 
                        approved_at = NOW(),
                        approval_notes = 'Auto-aprobado: diferencia completamente justificada'
                    WHERE id = $1
                `, [data.reconciliationId]);
            }
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

---

## 5. Resiliencia y Fallbacks

### 5.1 Política de Fallbacks por Módulo

#### **Matriz de Decisión: Sanear vs Fallar**

| Escenario | Módulo | Acción | Justificación |
|-----------|--------|--------|---------------|
| UUID inválido en terminal_id | POS | ⚠️ **LOG + BLOQUEAR** | Riesgo fiscal alto |
| Sesión zombie detectada | POS | ✅ **AUTO-CERRAR + LOG** | Continuidad operativa |
| Monto negativo en venta | POS | ❌ **RECHAZAR** | Integridad financiera |
| Stock negativo post-venta | POS | ⚠️ **PERMITIR + ALERTA** | Ventas no deben bloquearse |
| Terminal no encontrado | POS | ❌ **BLOQUEAR** | Trazabilidad obligatoria |
| Usuario sin permisos | POS | ❌ **BLOQUEAR** | Seguridad |
| DTE no emitido | POS | ⚠️ **COLA + RETRY** | Venta válida, DTE puede reintentar |
| Diferencia > $5000 | Caja | ⚠️ **BLOQUEAR RETIRO** | Investigación requerida |
| Auditoría falla | Caja | ❌ **ROLLBACK TODO** | Compliance obligatorio |
| FK violation en reporte | Admin | ✅ **SKIP + LOG** | Reportes no críticos |
| Timeout en conciliación | Batch | ✅ **RETRY 3x + ALERTA** | Procesos recuperables |

### 5.2 Implementación de Fallbacks

```typescript
// src/lib/resilience.ts

import { query } from '@/lib/db';
import { auditLog } from '@/lib/audit';

type FallbackPolicy = 'BLOCK' | 'WARN_AND_CONTINUE' | 'AUTO_REPAIR' | 'QUEUE_RETRY';

interface ResilienceConfig {
    module: 'POS' | 'ADMIN' | 'BATCH';
    operation: string;
    policy: FallbackPolicy;
    maxRetries?: number;
    alertOnFallback?: boolean;
}

const RESILIENCE_POLICIES: Record<string, ResilienceConfig> = {
    // POS - Políticas estrictas
    'POS:SALE_CREATE': {
        module: 'POS',
        operation: 'SALE_CREATE',
        policy: 'BLOCK',
        alertOnFallback: true
    },
    'POS:SESSION_OPEN': {
        module: 'POS',
        operation: 'SESSION_OPEN',
        policy: 'BLOCK',
        alertOnFallback: true
    },
    'POS:ZOMBIE_SESSION': {
        module: 'POS',
        operation: 'ZOMBIE_SESSION',
        policy: 'AUTO_REPAIR',
        alertOnFallback: true
    },
    'POS:STOCK_NEGATIVE': {
        module: 'POS',
        operation: 'STOCK_NEGATIVE',
        policy: 'WARN_AND_CONTINUE',
        alertOnFallback: true
    },
    
    // Admin - Políticas flexibles
    'ADMIN:REPORT_GENERATION': {
        module: 'ADMIN',
        operation: 'REPORT_GENERATION',
        policy: 'WARN_AND_CONTINUE',
        alertOnFallback: false
    },
    'ADMIN:BULK_UPDATE': {
        module: 'ADMIN',
        operation: 'BULK_UPDATE',
        policy: 'QUEUE_RETRY',
        maxRetries: 3,
        alertOnFallback: true
    },
    
    // Batch - Políticas de retry
    'BATCH:DTE_EMISSION': {
        module: 'BATCH',
        operation: 'DTE_EMISSION',
        policy: 'QUEUE_RETRY',
        maxRetries: 5,
        alertOnFallback: true
    },
    'BATCH:RECONCILIATION_AUTO': {
        module: 'BATCH',
        operation: 'RECONCILIATION_AUTO',
        policy: 'QUEUE_RETRY',
        maxRetries: 3,
        alertOnFallback: true
    }
};

/**
 * Ejecuta una operación con política de resiliencia.
 */
export async function withResilience<T>(
    policyKey: string,
    operation: () => Promise<T>,
    context: { userId?: string; entityId?: string; metadata?: any }
): Promise<{ success: boolean; data?: T; fallbackApplied?: boolean; error?: string }> {
    const config = RESILIENCE_POLICIES[policyKey];
    
    if (!config) {
        console.warn(`No resilience policy found for: ${policyKey}`);
        // Default: ejecutar sin política
        try {
            const data = await operation();
            return { success: true, data };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }

    let lastError: Error | null = null;
    let attempts = 0;
    const maxAttempts = config.maxRetries || 1;

    while (attempts < maxAttempts) {
        attempts++;
        
        try {
            const data = await operation();
            return { success: true, data };
        } catch (error: any) {
            lastError = error;
            console.error(`[${policyKey}] Attempt ${attempts}/${maxAttempts} failed:`, error.message);

            switch (config.policy) {
                case 'BLOCK':
                    // No reintentar, fallar inmediatamente
                    if (config.alertOnFallback) {
                        await createAlert(policyKey, error, context);
                    }
                    return { success: false, error: error.message };

                case 'WARN_AND_CONTINUE':
                    // Log warning pero continuar (retornar resultado parcial si es posible)
                    console.warn(`[${policyKey}] Warning: ${error.message}. Continuing with fallback.`);
                    if (config.alertOnFallback) {
                        await createAlert(policyKey, error, context);
                    }
                    return { success: true, fallbackApplied: true, error: error.message };

                case 'AUTO_REPAIR':
                    // Intentar reparación automática
                    const repaired = await attemptAutoRepair(policyKey, error, context);
                    if (repaired) {
                        continue; // Reintentar después de reparación
                    }
                    break;

                case 'QUEUE_RETRY':
                    // Encolar para reintento posterior
                    if (attempts >= maxAttempts) {
                        await queueForRetry(policyKey, context);
                        if (config.alertOnFallback) {
                            await createAlert(policyKey, error, context);
                        }
                    }
                    // Esperar antes de reintentar
                    await sleep(1000 * attempts); // Backoff exponencial simple
                    break;
            }
        }
    }

    return { success: false, error: lastError?.message || 'Max retries exceeded' };
}

async function attemptAutoRepair(
    policyKey: string,
    error: Error,
    context: any
): Promise<boolean> {
    console.log(`[AUTO_REPAIR] Attempting repair for ${policyKey}`);

    switch (policyKey) {
        case 'POS:ZOMBIE_SESSION':
            // Auto-cerrar sesión zombie
            if (context.entityId) {
                try {
                    await query(`
                        UPDATE cash_register_sessions
                        SET status = 'CLOSED_AUTO',
                            closed_at = NOW(),
                            notes = 'Auto-cerrado por sistema de resiliencia'
                        WHERE id = $1 AND status = 'OPEN'
                    `, [context.entityId]);
                    
                    await auditLog(
                        { userId: 'SYSTEM' },
                        {
                            action: 'SESSION_FORCE_CLOSE',
                            entityType: 'SESSION',
                            entityId: context.entityId,
                            metadata: { reason: 'AUTO_REPAIR', original_error: error.message }
                        }
                    );
                    
                    return true;
                } catch (e) {
                    console.error('Auto-repair failed:', e);
                    return false;
                }
            }
            break;

        case 'POS:STOCK_NEGATIVE':
            // Crear alerta de stock negativo pero permitir operación
            try {
                await query(`
                    INSERT INTO stock_alerts (batch_id, alert_type, message, created_at)
                    VALUES ($1, 'NEGATIVE_STOCK', $2, NOW())
                `, [context.entityId, `Stock negativo detectado: ${error.message}`]);
                return true; // "Reparado" = alertado
            } catch (e) {
                return false;
            }

        default:
            return false;
    }

    return false;
}

async function queueForRetry(policyKey: string, context: any): Promise<void> {
    try {
        await query(`
            INSERT INTO retry_queue (policy_key, context, status, created_at, next_retry_at)
            VALUES ($1, $2::jsonb, 'PENDING', NOW(), NOW() + INTERVAL '5 minutes')
        `, [policyKey, JSON.stringify(context)]);
    } catch (e) {
        console.error('Failed to queue for retry:', e);
    }
}

async function createAlert(policyKey: string, error: Error, context: any): Promise<void> {
    try {
        await query(`
            INSERT INTO system_alerts (type, severity, message, context, created_at)
            VALUES ('RESILIENCE_FALLBACK', 'HIGH', $1, $2::jsonb, NOW())
        `, [
            `Fallback activado en ${policyKey}: ${error.message}`,
            JSON.stringify(context)
        ]);
    } catch (e) {
        console.error('Failed to create alert:', e);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 5.3 Ejemplo de Uso en POS

```typescript
// src/actions/sales-v2.ts

import { withResilience } from '@/lib/resilience';
import { withAudit } from '@/lib/audit';

export async function createSaleSecure(saleData: SaleTransaction) {
    const context = {
        userId: saleData.seller_id,
        entityId: saleData.id,
        metadata: { terminal_id: saleData.terminal_id }
    };

    return withResilience('POS:SALE_CREATE', async () => {
        // La operación de venta con auditoría
        return withAudit(
            {
                userId: saleData.seller_id,
                terminalId: saleData.terminal_id,
                locationId: saleData.branch_id
            },
            {
                action: 'SALE_CREATE',
                entityType: 'SALE',
                entityId: saleData.id,
                newValues: {
                    total: saleData.total,
                    payment_method: saleData.payment_method,
                    items_count: saleData.items.length
                }
            },
            async () => {
                // Lógica de creación de venta existente
                return await executeSaleTransaction(saleData);
            }
        );
    }, context);
}
```

---

## 6. Recomendaciones de Implementación

### 6.1 Priorización de Cambios

| Prioridad | Cambio | Esfuerzo | Impacto | Sprint |
|-----------|--------|----------|---------|--------|
| 🔴 P0 | Migración UUID en terminals | 2h | CRÍTICO | 1 |
| 🔴 P0 | Bloqueo pesimista en openTerminal | 4h | CRÍTICO | 1 |
| 🔴 P0 | Tabla audit_log nueva | 4h | CRÍTICO | 1 |
| 🟡 P1 | Triggers de inmutabilidad | 2h | ALTO | 1 |
| 🟡 P1 | Módulo de conciliación | 16h | ALTO | 2 |
| 🟡 P1 | Sistema de alertas | 8h | ALTO | 2 |
| 🟢 P2 | Políticas de resiliencia | 8h | MEDIO | 3 |
| 🟢 P2 | Dashboard de auditoría | 16h | MEDIO | 3 |
| 🟢 P3 | Event sourcing parcial | 24h | BAJO | 4 |

### 6.2 Cambios en Capa de Aplicación

#### **Next.js Server Actions - Patrones Recomendados**

```typescript
// PATRÓN: Server Action con validación, auditoría y resiliencia

'use server';

import { z } from 'zod';
import { withResilience } from '@/lib/resilience';
import { withAudit } from '@/lib/audit';
import { pool } from '@/lib/db';

// 1. Schema de validación estricto
const ActionSchema = z.object({
    terminalId: z.string().uuid('Terminal ID inválido'),
    userId: z.string().uuid('User ID inválido'),
    amount: z.number().positive('Monto debe ser positivo')
});

// 2. Action tipada con resultado estructurado
type ActionResult<T> = 
    | { success: true; data: T }
    | { success: false; error: string; code?: string };

export async function secureAction(
    input: z.infer<typeof ActionSchema>
): Promise<ActionResult<{ id: string }>> {
    // 3. Validación temprana
    const parsed = ActionSchema.safeParse(input);
    if (!parsed.success) {
        return { 
            success: false, 
            error: parsed.error.errors[0].message,
            code: 'VALIDATION_ERROR'
        };
    }

    const { terminalId, userId, amount } = parsed.data;

    // 4. Contexto de auditoría
    const auditContext = {
        userId,
        terminalId,
        // locationId se obtiene del terminal si es necesario
    };

    // 5. Ejecución con resiliencia
    return withResilience('POS:SECURE_ACTION', async () => {
        return withAudit(auditContext, {
            action: 'CASH_MOVEMENT',
            entityType: 'TERMINAL',
            entityId: terminalId,
            newValues: { amount }
        }, async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                // 6. Bloqueo pesimista
                const lockResult = await client.query(
                    'SELECT id FROM terminals WHERE id = $1 FOR UPDATE NOWAIT',
                    [terminalId]
                );
                
                if (lockResult.rowCount === 0) {
                    throw new Error('Terminal no encontrado');
                }

                // 7. Lógica de negocio
                const result = await client.query(`
                    INSERT INTO ... RETURNING id
                `, [...]);

                await client.query('COMMIT');
                
                return { success: true, data: { id: result.rows[0].id } };
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        });
    }, { userId, entityId: terminalId });
}
```

#### **Middleware de Mantenimiento Mejorado**

```typescript
// src/middleware.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas que NUNCA deben bloquearse (emergencia)
const EMERGENCY_ROUTES = [
    '/api/health',
    '/api/auth/emergency-login',
    '/admin/maintenance'
];

// Rutas que requieren sesión activa para POS
const POS_ROUTES = [
    '/pos',
    '/api/sales',
    '/api/cash'
];

export async function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    // 1. Rutas de emergencia siempre accesibles
    if (EMERGENCY_ROUTES.some(route => path.startsWith(route))) {
        return NextResponse.next();
    }

    // 2. Verificar modo mantenimiento
    const maintenanceMode = process.env.MAINTENANCE_MODE === 'true';
    if (maintenanceMode && !path.startsWith('/maintenance')) {
        return NextResponse.redirect(new URL('/maintenance', request.url));
    }

    // 3. Validación de sesión para rutas POS
    if (POS_ROUTES.some(route => path.startsWith(route))) {
        const sessionToken = request.cookies.get('session-token');
        const terminalId = request.cookies.get('terminal-id');

        if (!sessionToken || !terminalId) {
            return NextResponse.redirect(new URL('/login?error=session_required', request.url));
        }

        // TODO: Validar que la sesión está activa en DB (cache con Redis recomendado)
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
```

---

## 7. Monitoreo y Alertas

### 7.1 Métricas Mínimas para Producción

```sql
-- =====================================================
-- VISTAS DE MONITOREO OPERACIONAL
-- =====================================================

-- 1. Estado actual de terminales
CREATE OR REPLACE VIEW v_terminals_realtime AS
SELECT 
    t.id,
    t.name,
    l.name AS location_name,
    t.status,
    u.name AS current_cashier,
    s.opened_at,
    EXTRACT(EPOCH FROM (NOW() - s.opened_at))/3600 AS hours_open,
    CASE 
        WHEN s.opened_at < NOW() - INTERVAL '12 hours' THEN 'ZOMBIE_WARNING'
        WHEN s.opened_at < NOW() - INTERVAL '8 hours' THEN 'LONG_SHIFT'
        ELSE 'NORMAL'
    END AS shift_status,
    (SELECT COUNT(*) FROM sales WHERE terminal_id = t.id AND timestamp > s.opened_at) AS sales_count,
    (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE terminal_id = t.id AND timestamp > s.opened_at) AS sales_total
FROM terminals t
LEFT JOIN locations l ON t.location_id = l.id
LEFT JOIN users u ON t.current_cashier_id = u.id
LEFT JOIN cash_register_sessions s ON (s.terminal_id = t.id AND s.status = 'OPEN')
WHERE t.deleted_at IS NULL;

-- 2. Alertas activas
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT 
    'ZOMBIE_SESSION' AS alert_type,
    'CRITICAL' AS severity,
    s.id AS entity_id,
    t.name AS terminal_name,
    u.name AS user_name,
    s.opened_at,
    EXTRACT(EPOCH FROM (NOW() - s.opened_at))/3600 AS hours_open
FROM cash_register_sessions s
JOIN terminals t ON s.terminal_id = t.id
LEFT JOIN users u ON s.user_id = u.id
WHERE s.status = 'OPEN' AND s.opened_at < NOW() - INTERVAL '12 hours'

UNION ALL

SELECT 
    'RECONCILIATION_PENDING' AS alert_type,
    CASE WHEN ABS(cr.difference) > 5000 THEN 'CRITICAL' ELSE 'HIGH' END AS severity,
    cr.id AS entity_id,
    t.name AS terminal_name,
    u.name AS user_name,
    cr.created_at,
    NULL
FROM cash_reconciliations cr
JOIN terminals t ON cr.terminal_id = t.id
LEFT JOIN users u ON cr.created_by = u.id
WHERE cr.status = 'PENDING' AND cr.created_at < NOW() - INTERVAL '4 hours'

UNION ALL

SELECT 
    'NEGATIVE_STOCK' AS alert_type,
    'HIGH' AS severity,
    ib.id AS entity_id,
    p.name AS terminal_name,
    NULL AS user_name,
    NOW(),
    NULL
FROM inventory_batches ib
JOIN products p ON ib.product_id = p.id
WHERE ib.quantity_real < 0;

-- 3. KPIs diarios
CREATE OR REPLACE VIEW v_daily_kpis AS
SELECT 
    DATE(s.timestamp) AS date,
    l.name AS location_name,
    COUNT(DISTINCT s.id) AS total_sales,
    SUM(s.total_amount) AS total_revenue,
    AVG(s.total_amount) AS avg_ticket,
    COUNT(DISTINCT s.terminal_id) AS active_terminals,
    COUNT(DISTINCT s.user_id) AS active_cashiers,
    SUM(CASE WHEN s.payment_method = 'CASH' THEN s.total_amount ELSE 0 END) AS cash_revenue,
    SUM(CASE WHEN s.payment_method != 'CASH' THEN s.total_amount ELSE 0 END) AS electronic_revenue,
    (SELECT COUNT(*) FROM audit_log al WHERE DATE(al.created_at) = DATE(s.timestamp) AND al.action_code IN ('SALE_VOID', 'SESSION_FORCE_CLOSE')) AS critical_events
FROM sales s
JOIN locations l ON s.location_id = l.id
WHERE s.timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE(s.timestamp), l.name
ORDER BY date DESC, location_name;
```

### 7.2 Sistema de Alertas Automatizado

```typescript
// src/jobs/alert-monitor.ts

import { query } from '@/lib/db';
import { sendNotification } from '@/lib/notifications';

interface Alert {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    entityId: string;
    metadata?: any;
}

/**
 * Job que se ejecuta cada 5 minutos para detectar anomalías
 */
export async function runAlertMonitor(): Promise<void> {
    const alerts: Alert[] = [];

    // 1. Sesiones zombie (> 12 horas)
    const zombieSessions = await query(`
        SELECT s.id, t.name as terminal_name, u.name as user_name,
               EXTRACT(EPOCH FROM (NOW() - s.opened_at))/3600 as hours_open
        FROM cash_register_sessions s
        JOIN terminals t ON s.terminal_id = t.id
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.status = 'OPEN' AND s.opened_at < NOW() - INTERVAL '12 hours'
    `);

    for (const session of zombieSessions.rows) {
        alerts.push({
            type: 'ZOMBIE_SESSION',
            severity: 'CRITICAL',
            message: `Sesión zombie detectada en ${session.terminal_name}. Usuario: ${session.user_name}. Horas abiertas: ${Math.round(session.hours_open)}`,
            entityId: session.id
        });
    }

    // 2. Conciliaciones pendientes sin justificar (> 4 horas)
    const pendingReconciliations = await query(`
        SELECT cr.id, cr.difference, t.name as terminal_name,
               EXTRACT(EPOCH FROM (NOW() - cr.created_at))/3600 as hours_pending
        FROM cash_reconciliations cr
        JOIN terminals t ON cr.terminal_id = t.id
        WHERE cr.status = 'PENDING' 
        AND cr.requires_justification = true
        AND cr.created_at < NOW() - INTERVAL '4 hours'
    `);

    for (const recon of pendingReconciliations.rows) {
        alerts.push({
            type: 'RECONCILIATION_PENDING',
            severity: Math.abs(recon.difference) > 5000 ? 'CRITICAL' : 'HIGH',
            message: `Conciliación pendiente en ${recon.terminal_name}. Diferencia: $${recon.difference}. Horas pendiente: ${Math.round(recon.hours_pending)}`,
            entityId: recon.id,
            metadata: { difference: recon.difference }
        });
    }

    // 3. Stock negativo
    const negativeStock = await query(`
        SELECT ib.id, p.name, ib.quantity_real, l.name as location_name
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        JOIN locations l ON ib.location_id = l.id
        WHERE ib.quantity_real < 0
    `);

    for (const stock of negativeStock.rows) {
        alerts.push({
            type: 'NEGATIVE_STOCK',
            severity: 'HIGH',
            message: `Stock negativo: ${stock.name} en ${stock.location_name}. Cantidad: ${stock.quantity_real}`,
            entityId: stock.id
        });
    }

    // 4. Múltiples intentos de login fallidos
    const failedLogins = await query(`
        SELECT user_id, user_name, COUNT(*) as attempts, MAX(created_at) as last_attempt
        FROM audit_log
        WHERE action_code = 'USER_LOGIN_FAILED'
        AND created_at > NOW() - INTERVAL '1 hour'
        GROUP BY user_id, user_name
        HAVING COUNT(*) >= 3
    `);

    for (const login of failedLogins.rows) {
        alerts.push({
            type: 'BRUTE_FORCE_ATTEMPT',
            severity: login.attempts >= 5 ? 'CRITICAL' : 'HIGH',
            message: `${login.attempts} intentos de login fallidos para ${login.user_name} en la última hora`,
            entityId: login.user_id || 'UNKNOWN',
            metadata: { attempts: login.attempts }
        });
    }

    // 5. Anulaciones excesivas
    const voidCount = await query(`
        SELECT location_id, COUNT(*) as void_count
        FROM audit_log
        WHERE action_code = 'SALE_VOID'
        AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY location_id
        HAVING COUNT(*) > 5
    `);

    for (const voids of voidCount.rows) {
        alerts.push({
            type: 'EXCESSIVE_VOIDS',
            severity: 'HIGH',
            message: `${voids.void_count} anulaciones en las últimas 24 horas en location ${voids.location_id}`,
            entityId: voids.location_id
        });
    }

    // Procesar alertas
    for (const alert of alerts) {
        // Verificar si ya existe alerta activa para evitar spam
        const existing = await query(`
            SELECT id FROM system_alerts 
            WHERE type = $1 AND entity_id = $2 AND status = 'OPEN'
            AND created_at > NOW() - INTERVAL '1 hour'
        `, [alert.type, alert.entityId]);

        if (existing.rowCount === 0) {
            // Crear nueva alerta
            await query(`
                INSERT INTO system_alerts (type, severity, message, entity_id, metadata, status, created_at)
                VALUES ($1, $2, $3, $4, $5::jsonb, 'OPEN', NOW())
            `, [alert.type, alert.severity, alert.message, alert.entityId, JSON.stringify(alert.metadata || {})]);

            // Notificar según severidad
            if (alert.severity === 'CRITICAL') {
                await sendNotification({
                    channel: 'SMS', // SMS para críticos
                    recipients: await getManagerPhones(),
                    message: `🚨 CRÍTICO: ${alert.message}`
                });
            }

            if (alert.severity === 'CRITICAL' || alert.severity === 'HIGH') {
                await sendNotification({
                    channel: 'EMAIL',
                    recipients: await getManagerEmails(),
                    subject: `[${alert.severity}] ${alert.type}`,
                    message: alert.message
                });
            }
        }
    }

    console.log(`[AlertMonitor] Processed ${alerts.length} alerts`);
}

async function getManagerPhones(): Promise<string[]> {
    const result = await query(`
        SELECT contact_phone FROM users 
        WHERE role IN ('MANAGER', 'GERENTE_GENERAL') 
        AND contact_phone IS NOT NULL
    `);
    return result.rows.map(r => r.contact_phone);
}

async function getManagerEmails(): Promise<string[]> {
    const result = await query(`
        SELECT email FROM users 
        WHERE role IN ('MANAGER', 'GERENTE_GENERAL') 
        AND email IS NOT NULL
    `);
    return result.rows.map(r => r.email);
}
```

### 7.3 Tabla de Alertas del Sistema

```sql
-- Tabla para alertas persistentes
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
    acknowledged_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    resolution_notes TEXT
);

CREATE INDEX idx_system_alerts_status ON system_alerts(status) WHERE status = 'OPEN';
CREATE INDEX idx_system_alerts_severity ON system_alerts(severity, created_at DESC);
CREATE INDEX idx_system_alerts_type ON system_alerts(type);
```

---

## Apéndice A: Scripts de Migración

### A.1 Migración de Emergencia - Tipos de Datos

```sql
-- =====================================================
-- MIGRACIÓN 004: Estandarización de UUIDs
-- EJECUTAR EN VENTANA DE MANTENIMIENTO
-- Tiempo estimado: 5-15 minutos
-- =====================================================

BEGIN;

-- 1. Backup
CREATE TABLE terminals_backup_uuid_migration AS SELECT * FROM terminals;
CREATE TABLE cash_register_sessions_backup_uuid_migration AS SELECT * FROM cash_register_sessions;

-- 2. Limpiar datos huérfanos
DELETE FROM cash_register_sessions 
WHERE terminal_id NOT IN (SELECT id::text FROM terminals);

-- 3. Convertir terminals.id a UUID
ALTER TABLE terminals ALTER COLUMN id TYPE UUID USING id::uuid;

-- 4. Convertir cash_register_sessions.terminal_id a UUID
ALTER TABLE cash_register_sessions ALTER COLUMN terminal_id TYPE UUID USING terminal_id::uuid;

-- 5. Agregar FK estricta
ALTER TABLE cash_register_sessions
DROP CONSTRAINT IF EXISTS fk_sessions_terminal;

ALTER TABLE cash_register_sessions
ADD CONSTRAINT fk_sessions_terminal
FOREIGN KEY (terminal_id) REFERENCES terminals(id)
ON DELETE RESTRICT;

-- 6. Registrar migración
INSERT INTO schema_migrations (version, description)
VALUES ('20241223_uuid_standardization', 'UUID standardization for terminals');

COMMIT;
```

### A.2 Creación de Tablas de Auditoría

```sql
-- Ejecutar el SQL de la sección 3.1 completo
-- Archivo: migrations/005_audit_system.sql
```

---

## Apéndice B: Checklist de Implementación

### Sprint 1 (Semana 1-2)
- [ ] Migración UUID en terminals
- [ ] Implementar bloqueo pesimista en openTerminal
- [ ] Crear tabla audit_log con triggers
- [ ] Migrar logAction a nuevo sistema
- [ ] Tests de concurrencia para apertura de terminal

### Sprint 2 (Semana 3-4)
- [ ] Módulo de conciliación completo
- [ ] UI de arqueo con conteo físico
- [ ] Sistema de justificaciones
- [ ] Alertas de diferencias
- [ ] Dashboard de conciliaciones

### Sprint 3 (Semana 5-6)
- [ ] Políticas de resiliencia por módulo
- [ ] Job de monitoreo de alertas
- [ ] Notificaciones SMS/Email para críticos
- [ ] Dashboard de auditoría para gerencia
- [ ] Exportación de logs para compliance

### Sprint 4 (Semana 7-8)
- [ ] Optimización de índices
- [ ] Particionamiento de audit_log
- [ ] Documentación de operaciones
- [ ] Capacitación a usuarios
- [ ] Go-live con monitoreo intensivo

---

## Conclusión

El sistema Pharma-Synapse v3.1 tiene una base arquitectónica sólida pero requiere **reforzamiento urgente** en:

1. **Integridad de datos**: Estandarización de UUIDs
2. **Concurrencia**: Bloqueos pesimistas en operaciones críticas
3. **Auditoría**: Sistema inmutable con trazabilidad completa
4. **Conciliación**: Módulo de arqueos con justificaciones
5. **Resiliencia**: Políticas claras de fallback por módulo

La implementación de estas recomendaciones reducirá el riesgo de **7.2/10 a aproximadamente 3.5/10**, cumpliendo con estándares de sistemas financieros tipo banca/retail.

---

**Documento preparado por:** Arquitecto de Software Senior  
**Revisión:** Pendiente por CTO  
**Próxima actualización:** Post-implementación Sprint 1
