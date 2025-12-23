# Pharma-Synapse v3.1 - Auditoría de Arquitectura y Recomendaciones

**Documento Técnico para Farmacias Vallenar**  
**Versión:** 1.0  
**Fecha:** 2025-12-23  
**Autor:** Arquitecto de Software Senior  
**Clasificación:** Confidencial - Uso Interno

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Análisis de Riesgos](#2-análisis-de-riesgos)
3. [Modelo de Datos y Auditoría](#3-modelo-de-datos-y-auditoría)
4. [Módulo de Conciliación Financiera](#4-módulo-de-conciliación-financiera)
5. [Política de Fallbacks y Resiliencia](#5-política-de-fallbacks-y-resiliencia)
6. [Recomendaciones de Implementación](#6-recomendaciones-de-implementación)
7. [Monitoreo y Alertas](#7-monitoreo-y-alertas)
8. [Anexos Técnicos](#8-anexos-técnicos)

---

## 1. Resumen Ejecutivo

### 1.1 Estado Actual del Sistema

El sistema Pharma-Synapse v3.1 presenta una arquitectura sólida para operaciones POS farmacéuticas, con:

**Fortalezas identificadas:**
- ✅ Transacciones ACID en ventas con descuento atómico de stock
- ✅ Soft-deletes en terminales (deleted_at)
- ✅ Validadores UUID híbridos (isValidUUID)
- ✅ Triggers para prevención de doble apertura
- ✅ Índice único para sesiones abiertas por terminal
- ✅ Vista de "Zombie Sessions" (v_zombie_sessions)
- ✅ Auto-cierre de sesiones >24h

**Áreas críticas que requieren atención:**
- ⚠️ Inconsistencia de tipos ID (TEXT vs UUID)
- ⚠️ Auditoría incompleta (acciones críticas sin registro)
- ⚠️ Falta trazabilidad DTE↔Venta↔Conciliación
- ⚠️ Conciliación financiera sin justificaciones estructuradas

### 1.2 Prioridades de Acción

| Prioridad | Área | Esfuerzo | Impacto |
|-----------|------|----------|---------|
| P0 | Normalizar IDs a UUID | Medio | Crítico |
| P0 | Completar auditoría forense | Bajo | Crítico |
| P1 | Módulo de conciliación | Alto | Alto |
| P1 | Trazabilidad fiscal DTE | Medio | Alto |
| P2 | Sistema de alertas | Medio | Medio |

---

## 2. Análisis de Riesgos

### 2.1 Riesgos de Inconsistencia de Datos

#### R001: IDs Híbridos TEXT/UUID [SEVERIDAD: ALTA]

**Descripción:**  
La columna `terminals.location_id` se declara como `VARCHAR(100)` en algunos archivos y `UUID` en otros. La migración 003 intenta convertir pero hay inconsistencias latentes.

**Evidencia del código:**
```sql
-- En 002_pos_reengineering.sql
location_id VARCHAR(100),

-- En 003_fix_terminals_integrity.sql (intento de corrección)
ALTER TABLE cash_register_sessions ALTER COLUMN terminal_id TYPE UUID USING terminal_id::uuid;
```

**Impacto:**
- Queries con `::uuid` cast pueden fallar silenciosamente
- JOINs entre tablas pueden devolver resultados vacíos
- Posible corrupción de datos en conciliaciones

**Mitigación actual:**
```typescript
// src/lib/utils.ts - Validador existente
export function isValidUUID(id?: string | null): boolean {
    if (!id) return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(id);
}
```

**Recomendación:**
```sql
-- Migración de normalización (ejecutar en ventana de mantenimiento)
BEGIN;

-- 1. Backup previo obligatorio
CREATE TABLE _backup_terminals_20251223 AS SELECT * FROM terminals;
CREATE TABLE _backup_sessions_20251223 AS SELECT * FROM cash_register_sessions;

-- 2. Agregar columna temporal UUID
ALTER TABLE terminals ADD COLUMN location_id_new UUID;

-- 3. Migrar datos (con fallback para valores inválidos)
UPDATE terminals 
SET location_id_new = CASE 
    WHEN location_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN location_id::uuid 
    ELSE NULL 
END;

-- 4. Validar antes de continuar
SELECT COUNT(*) as orphaned FROM terminals WHERE location_id_new IS NULL;
-- Si > 0, revisar manualmente antes de continuar

-- 5. Swap columnas (solo si paso 4 OK)
ALTER TABLE terminals DROP COLUMN location_id;
ALTER TABLE terminals RENAME COLUMN location_id_new TO location_id;
ALTER TABLE terminals ALTER COLUMN location_id SET NOT NULL;

COMMIT;
```

---

#### R002: Sesiones "Zombie" sin Resolución [SEVERIDAD: ALTA]

**Descripción:**  
Aunque existe `v_zombie_sessions` y `auto_close_stale_sessions()`, el cierre automático no registra evidencia fiscal completa.

**Problema actual:**
```sql
-- Función existente - INCOMPLETA
UPDATE cash_register_sessions
SET status = 'CLOSED_AUTO',
    closed_at = NOW(),
    notes = COALESCE(notes, '') || ' | Auto-cerrado por timeout >24h'
WHERE status = 'OPEN'
  AND opened_at < NOW() - INTERVAL '24 hours';
```

**Falta:**
- No se calcula `closing_amount` esperado
- No se genera alerta a supervisores
- No se bloquea al usuario hasta justificación
- No hay registro en `audit_logs`

**Recomendación - Procedimiento mejorado:**
```sql
CREATE OR REPLACE FUNCTION auto_close_stale_sessions_v2()
RETURNS TABLE(session_id TEXT, user_id TEXT, hours_open NUMERIC, expected_amount NUMERIC) AS $$
DECLARE
    rec RECORD;
    v_expected_cash NUMERIC;
BEGIN
    FOR rec IN 
        SELECT s.id, s.user_id, s.terminal_id, s.opening_amount, s.opened_at,
               EXTRACT(EPOCH FROM (NOW() - s.opened_at))/3600 as hours
        FROM cash_register_sessions s
        WHERE s.status = 'OPEN'
          AND s.opened_at < NOW() - INTERVAL '24 hours'
    LOOP
        -- Calcular cierre esperado
        SELECT rec.opening_amount + 
               COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN total_amount ELSE 0 END), 0)
        INTO v_expected_cash
        FROM sales 
        WHERE terminal_id = rec.terminal_id::uuid
          AND timestamp >= rec.opened_at;
        
        -- Cerrar sesión con datos calculados
        UPDATE cash_register_sessions
        SET status = 'CLOSED_AUTO',
            closed_at = NOW(),
            closing_amount = NULL, -- Desconocido
            expected_closing_amount = v_expected_cash,
            notes = COALESCE(notes, '') || 
                    format(' | [AUTO-CLOSED] %s hrs open. Expected: $%s. Requires reconciliation.', 
                           rec.hours::int, v_expected_cash)
        WHERE id = rec.id;
        
        -- Registrar auditoría
        INSERT INTO audit_logs (usuario, accion, detalle, ip, fecha)
        VALUES ('SYSTEM', 'AUTO_CLOSE_ZOMBIE', 
                format('Session %s auto-closed after %s hours. User: %s', rec.id, rec.hours::int, rec.user_id),
                'INTERNAL', NOW());
        
        -- Flag usuario para revisión (nueva tabla)
        INSERT INTO user_pending_reviews (user_id, reason, session_id, created_at)
        VALUES (rec.user_id, 'ZOMBIE_SESSION', rec.id, NOW())
        ON CONFLICT (user_id, session_id) DO NOTHING;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

#### R003: Ventas sin Vinculación Completa a Sesión [SEVERIDAD: MEDIA]

**Descripción:**  
La tabla `sales` tiene `terminal_id` pero no siempre `shift_id` (sesión). Esto dificulta conciliaciones.

**Evidencia:**
```sql
-- 002_pos_reengineering.sql
ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id VARCHAR(50);
```

**Problema:**
- El campo existe pero no se enforce como NOT NULL
- Ventas pueden quedar huérfanas de sesión

**Recomendación:**
```sql
-- 1. Reparar ventas huérfanas (one-time)
UPDATE sales s
SET shift_id = (
    SELECT crs.id FROM cash_register_sessions crs
    WHERE crs.terminal_id = s.terminal_id::uuid
      AND s.timestamp BETWEEN crs.opened_at AND COALESCE(crs.closed_at, NOW())
    LIMIT 1
)
WHERE s.shift_id IS NULL;

-- 2. Agregar constraint después de limpiar
ALTER TABLE sales ALTER COLUMN shift_id SET NOT NULL;
ALTER TABLE sales ADD CONSTRAINT fk_sales_session 
    FOREIGN KEY (shift_id) REFERENCES cash_register_sessions(id);
```

---

#### R004: Concurrencia en Descuento de Stock [SEVERIDAD: MEDIA]

**Descripción:**  
El descuento de stock es atómico dentro de la transacción pero no previene valores negativos.

**Código actual (sales.ts):**
```typescript
const stockRes = await client.query(
    `UPDATE inventory_batches 
     SET quantity_real = quantity_real - $1 
     WHERE id = $2
     RETURNING quantity_real`,
    [item.quantity, item.batch_id]
);
// NO hay validación de quantity_real >= 0
```

**Recomendación - Constraint de BD + Validación:**
```sql
-- Constraint a nivel de BD (fail-safe)
ALTER TABLE inventory_batches
ADD CONSTRAINT chk_stock_non_negative 
CHECK (quantity_real >= 0) NOT VALID;

-- Validar constraint gradualmente (para datos existentes)
-- ALTER TABLE inventory_batches VALIDATE CONSTRAINT chk_stock_non_negative;
```

```typescript
// Versión mejorada con validación
const stockRes = await client.query(
    `UPDATE inventory_batches 
     SET quantity_real = quantity_real - $1 
     WHERE id = $2 AND quantity_real >= $1
     RETURNING quantity_real`,
    [item.quantity, item.batch_id]
);

if (stockRes.rowCount === 0) {
    throw new Error(`Stock insuficiente para batch ${item.batch_id}`);
}
```

---

### 2.2 Riesgos de Brechas de Auditoría

#### R005: Acciones Críticas sin Registro [SEVERIDAD: ALTA]

**Acciones que DEBEN registrarse y NO se están registrando consistentemente:**

| Acción | Archivo | Audita? | Severidad |
|--------|---------|---------|-----------|
| Apertura de caja | terminals.ts:openTerminal | ❌ NO | ALTA |
| Cierre normal de caja | terminals.ts:closeTerminal | ❌ NO | ALTA |
| Venta completada | sales.ts:createSale | ❌ NO | ALTA |
| Anulación/Devolución | (no existe) | N/A | CRÍTICA |
| Modificación de precio | (no existe) | N/A | CRÍTICA |
| Cambio de usuario | | ❌ NO | MEDIA |
| Cierre forzado | terminals.ts:forceCloseTerminalShift | ✅ SÍ | - |
| Conciliación | reconciliation.ts | ⚠️ Parcial | ALTA |
| Login/Logout | | ❌ NO | MEDIA |

**Acciones que SÍ se auditan:**
- `FORCE_CLOSE` y `FORCE_CLOSE_SUCCESS`

---

#### R006: Tabla audit_logs Insuficiente [SEVERIDAD: MEDIA]

**Esquema actual:**
```sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(255) NOT NULL,
    accion VARCHAR(50) NOT NULL,
    detalle TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip VARCHAR(45)
);
```

**Problemas:**
- Sin `terminal_id` (¿desde qué caja?)
- Sin `session_id` (¿en qué turno?)
- Sin `location_id` (¿qué sucursal?)
- Sin `old_value` / `new_value` (cambios no trazables)
- Sin `request_id` para correlación
- Datos sensibles podrían ir a `detalle` sin encriptar

---

### 2.3 Tabla de Riesgos Consolidada

| ID | Riesgo | Severidad | Probabilidad | Impacto Fiscal | Estado |
|----|--------|-----------|--------------|----------------|--------|
| R001 | IDs híbridos TEXT/UUID | ALTA | Alta | SII Rechazo | Abierto |
| R002 | Zombie Sessions incompletas | ALTA | Media | Descuadre | Mitigado parcial |
| R003 | Ventas sin shift_id | MEDIA | Alta | Conciliación | Abierto |
| R004 | Stock negativo posible | MEDIA | Baja | Inventario | Abierto |
| R005 | Auditoría incompleta | ALTA | Alta | Fiscalización | Abierto |
| R006 | Estructura audit_logs pobre | MEDIA | Alta | Forense | Abierto |
| R007 | Sin trazabilidad DTE↔Venta | ALTA | Alta | SII | Abierto |
| R008 | Devoluciones no implementadas | CRÍTICA | Alta | Fiscal | Bloqueante |

---

## 3. Modelo de Datos y Auditoría

### 3.1 Modelo de Auditoría Propuesto

#### Opción A: Tabla de Auditoría Enriquecida (Recomendada)

```sql
-- =====================================================
-- AUDIT_EVENTS: Tabla de Auditoría Forense Completa
-- =====================================================
CREATE TABLE audit_events (
    -- Identificación
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(50) NOT NULL, -- Formato: EVT-YYYYMMDD-XXXXXX
    
    -- Contexto de Negocio
    location_id UUID REFERENCES locations(id),
    terminal_id UUID REFERENCES terminals(id),
    session_id VARCHAR(50) REFERENCES cash_register_sessions(id),
    
    -- Actor
    user_id UUID REFERENCES users(id),
    user_role VARCHAR(50),
    impersonated_by UUID REFERENCES users(id), -- Si un admin actúa en nombre de otro
    
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
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    
    -- Temporal
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Índices implícitos via PK
    CONSTRAINT chk_action_status CHECK (action_status IN ('SUCCESS', 'FAILED', 'BLOCKED', 'PENDING'))
);

-- Índices para queries frecuentes
CREATE INDEX idx_audit_events_location_date ON audit_events(location_id, created_at DESC);
CREATE INDEX idx_audit_events_user ON audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_events_session ON audit_events(session_id);
CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_events_action ON audit_events(action_category, action_type);
CREATE INDEX idx_audit_events_pending_review ON audit_events(requires_manager_review) WHERE requires_manager_review = TRUE;

-- Índice GIN para búsqueda en JSONB
CREATE INDEX idx_audit_events_old_values ON audit_events USING GIN (old_values jsonb_path_ops);
CREATE INDEX idx_audit_events_new_values ON audit_events USING GIN (new_values jsonb_path_ops);

-- Particionamiento por mes (para alta volumetría)
-- CREATE TABLE audit_events_2025_12 PARTITION OF audit_events 
--     FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
```

#### Opción B: Triggers Automáticos en PostgreSQL

**Ventajas:**
- Captura automática sin modificar código
- No se puede "saltear" desde la app
- Funciona para accesos directos a BD

**Desventajas:**
- No captura contexto de negocio (user_id de sesión app)
- Más difícil de mantener
- Puede impactar performance

```sql
-- =====================================================
-- TRIGGER: Auditoría automática de cambios en sales
-- =====================================================
CREATE OR REPLACE FUNCTION audit_sales_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_events (
        action_category,
        action_type,
        resource_type,
        resource_id,
        old_values,
        new_values,
        delta_amount,
        terminal_id,
        user_id
    ) VALUES (
        'SALE',
        TG_OP,
        'SALE',
        COALESCE(NEW.id, OLD.id)::text,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        COALESCE(NEW.total_amount, 0) - COALESCE(OLD.total_amount, 0),
        COALESCE(NEW.terminal_id, OLD.terminal_id),
        COALESCE(NEW.user_id, OLD.user_id)
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_sales
AFTER INSERT OR UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION audit_sales_changes();
```

#### Opción C: Híbrido (Recomendación Final)

**Estrategia:**
1. **Triggers** para tablas críticas (sales, cash_movements, cash_register_sessions)
2. **Logs de aplicación** enriquecidos para contexto
3. **audit_events** como tabla centralizada

### 3.2 Comparativa de Aproximaciones

| Aspecto | Solo App | Solo Triggers | Híbrido |
|---------|----------|---------------|---------|
| Contexto de negocio | ✅ Completo | ❌ Limitado | ✅ Completo |
| Inmutabilidad | ⚠️ Bypass posible | ✅ Garantizada | ✅ Garantizada |
| Performance | ✅ Controlada | ⚠️ Overhead | ⚠️ Overhead |
| Mantenimiento | ✅ Fácil | ⚠️ SQL complejo | ⚠️ Medio |
| Compliance fiscal | ⚠️ Depende | ✅ Automático | ✅ Automático |

### 3.3 Trazabilidad Venta → DTE → Conciliación

```sql
-- =====================================================
-- MODELO RELACIONAL: Trazabilidad Fiscal Completa
-- =====================================================

-- Ventas (ya existe, agregar campos)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS 
    dte_status VARCHAR(30) DEFAULT 'PENDING'; -- 'PENDING', 'SENT', 'ACCEPTED', 'REJECTED'
ALTER TABLE sales ADD COLUMN IF NOT EXISTS 
    dte_track_id VARCHAR(50); -- Track ID del SII
ALTER TABLE sales ADD COLUMN IF NOT EXISTS 
    dte_response JSONB; -- Respuesta completa del SII

-- Relación DTE ↔ Sale (1:1 o 1:N para notas crédito)
CREATE TABLE IF NOT EXISTS sale_dte_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    dte_type INTEGER NOT NULL, -- 39: Boleta, 33: Factura, etc.
    dte_folio INTEGER NOT NULL,
    dte_rut_emisor VARCHAR(20) NOT NULL,
    link_type VARCHAR(20) DEFAULT 'PRIMARY', -- 'PRIMARY', 'CREDIT_NOTE', 'DEBIT_NOTE'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(sale_id, dte_type, dte_folio)
);

-- Vista consolidada para reportes fiscales
CREATE OR REPLACE VIEW v_sales_fiscal_status AS
SELECT 
    s.id as sale_id,
    s.timestamp as sale_date,
    s.total_amount,
    s.payment_method,
    s.terminal_id,
    s.shift_id,
    crs.user_id as cashier_id,
    u.name as cashier_name,
    s.dte_folio,
    s.dte_status,
    d.status as dte_sii_status,
    d.track_id as sii_track_id,
    l.name as location_name,
    CASE 
        WHEN s.dte_status = 'ACCEPTED' AND d.status = 'ACEPTADO' THEN 'COMPLIANT'
        WHEN s.dte_status = 'PENDING' THEN 'PENDING_DTE'
        WHEN d.status = 'RECHAZADO' THEN 'REJECTED_BY_SII'
        ELSE 'REVIEW_REQUIRED'
    END as fiscal_compliance_status
FROM sales s
LEFT JOIN cash_register_sessions crs ON s.shift_id = crs.id
LEFT JOIN users u ON crs.user_id = u.id
LEFT JOIN dte_documents d ON (
    s.dte_folio::int = d.folio 
    AND d.tipo = 39 -- Boleta
)
LEFT JOIN terminals t ON s.terminal_id = t.id
LEFT JOIN locations l ON t.location_id = l.id
ORDER BY s.timestamp DESC;
```

---

## 4. Módulo de Conciliación Financiera

### 4.1 Flujo Conceptual de Arqueo

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE ARQUEO Y CONCILIACIÓN                       │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │  CAJERO  │───►│  CIERRE DE   │───►│   ARQUEO     │───►│ DECLARACIÓN │
  │ Solicita │    │   TURNO      │    │   FÍSICO     │    │  DE MONTO   │
  └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                 │
                  ┌───────────────────────────────────────────────┘
                  ▼
        ┌─────────────────┐
        │ CÁLCULO SISTEMA │
        │                 │
        │ Teórico =       │
        │   Apertura      │
        │ + Ventas Cash   │
        │ + Ingresos      │
        │ - Egresos       │
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │  ¿DIFERENCIA?   │
        └────────┬────────┘
                 │
      ┌──────────┼──────────┐
      │          │          │
      ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────────┐
│ = 0     │ │ < 0     │ │ > 0         │
│ CUADRA  │ │FALTANTE │ │ SOBRANTE    │
└────┬────┘ └────┬────┘ └──────┬──────┘
     │          │              │
     │          ▼              ▼
     │    ┌──────────────────────────┐
     │    │  REQUIERE JUSTIFICACIÓN  │
     │    │  ┌────────────────────┐  │
     │    │  │ • Error de cambio  │  │
     │    │  │ • Descuento manual │  │
     │    │  │ • Venta no regist. │  │
     │    │  │ • Devolución       │  │
     │    │  │ • Otro (especif.)  │  │
     │    │  └────────────────────┘  │
     │    └───────────┬──────────────┘
     │                │
     │    ┌───────────▼──────────────┐
     │    │  LÍMITES DE TOLERANCIA   │
     │    │                          │
     │    │  ≤ $5,000 → Auto-aprobar │
     │    │  ≤ $20,000 → Supervisor  │
     │    │  > $20,000 → Gerente     │
     │    │  > $50,000 → Contabilidad│
     │    └───────────┬──────────────┘
     │                │
     └────────┬───────┘
              │
     ┌────────▼────────┐
     │   CONCILIACIÓN  │
     │    REGISTRADA   │
     │                 │
     │ • Histórico     │
     │ • Inmutable     │
     │ • Vinculada     │
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │    REMESA A     │
     │   TESORERÍA     │
     └─────────────────┘
```

### 4.2 Modelo de Datos para Conciliación

```sql
-- =====================================================
-- TABLAS DE CONCILIACIÓN FINANCIERA
-- =====================================================

-- Tipos de justificación predefinidos
CREATE TABLE reconciliation_reason_types (
    id VARCHAR(50) PRIMARY KEY,
    description TEXT NOT NULL,
    requires_evidence BOOLEAN DEFAULT FALSE,
    max_auto_approve_amount NUMERIC(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO reconciliation_reason_types (id, description, requires_evidence, max_auto_approve_amount) VALUES
('ERROR_CAMBIO', 'Error al dar cambio al cliente', FALSE, 5000),
('DESCUENTO_MANUAL', 'Descuento manual no registrado', TRUE, 10000),
('VENTA_NO_REGISTRADA', 'Venta realizada sin registrar', TRUE, 0),
('DEVOLUCION_PARCIAL', 'Devolución parcial al cliente', TRUE, 0),
('FONDO_INICIAL_INCORRECTO', 'El fondo inicial declarado era incorrecto', FALSE, 10000),
('ERROR_CONTEO', 'Error de conteo en arqueo', FALSE, 5000),
('ROBO_HURTO', 'Sospecha de robo o hurto', TRUE, 0),
('OTRO', 'Otra razón (requiere descripción)', TRUE, 0);

-- Registro de conciliaciones (Arqueos)
CREATE TABLE cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vinculación a sesión
    session_id VARCHAR(50) NOT NULL REFERENCES cash_register_sessions(id),
    terminal_id UUID NOT NULL REFERENCES terminals(id),
    location_id UUID NOT NULL REFERENCES locations(id),
    
    -- Datos del arqueo
    opening_amount NUMERIC(15,2) NOT NULL,
    expected_closing_amount NUMERIC(15,2) NOT NULL, -- Calculado por sistema
    declared_closing_amount NUMERIC(15,2) NOT NULL, -- Declarado por cajero
    difference NUMERIC(15,2) NOT NULL, -- declared - expected
    
    -- Breakdown del esperado (para auditoría)
    cash_sales_total NUMERIC(15,2) NOT NULL,
    cash_movements_in NUMERIC(15,2) NOT NULL,
    cash_movements_out NUMERIC(15,2) NOT NULL,
    
    -- Estado
    status VARCHAR(30) DEFAULT 'PENDING', -- 'PENDING', 'JUSTIFIED', 'APPROVED', 'ESCALATED', 'CLOSED'
    
    -- Usuarios
    cashier_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Approval chain
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approval_level VARCHAR(20), -- 'AUTO', 'SUPERVISOR', 'MANAGER', 'FINANCE'
    
    CONSTRAINT chk_reconciliation_status CHECK (
        status IN ('PENDING', 'JUSTIFIED', 'APPROVED', 'ESCALATED', 'CLOSED')
    )
);

-- Justificaciones de diferencias
CREATE TABLE reconciliation_justifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id) ON DELETE CASCADE,
    
    -- Tipo y detalle
    reason_type VARCHAR(50) NOT NULL REFERENCES reconciliation_reason_types(id),
    amount NUMERIC(15,2) NOT NULL, -- Monto que justifica esta razón
    description TEXT NOT NULL,
    
    -- Vinculación opcional a transacciones específicas
    related_sale_id UUID REFERENCES sales(id),
    related_movement_id UUID REFERENCES cash_movements(id),
    related_customer_rut VARCHAR(20),
    
    -- Evidencia
    evidence_urls TEXT[], -- Array de URLs a fotos/documentos
    
    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Validación
    CONSTRAINT chk_amount_sign CHECK (
        -- El monto debe tener el signo correcto según si es faltante o sobrante
        amount != 0
    )
);

-- Historial de aprobaciones (para audit trail completo)
CREATE TABLE reconciliation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id),
    
    action VARCHAR(20) NOT NULL, -- 'APPROVE', 'REJECT', 'ESCALATE', 'REQUEST_INFO'
    actor_id UUID NOT NULL REFERENCES users(id),
    actor_role VARCHAR(50) NOT NULL,
    
    notes TEXT,
    previous_status VARCHAR(30) NOT NULL,
    new_status VARCHAR(30) NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_reconciliations_session ON cash_reconciliations(session_id);
CREATE INDEX idx_reconciliations_status ON cash_reconciliations(status) WHERE status != 'CLOSED';
CREATE INDEX idx_reconciliations_location_date ON cash_reconciliations(location_id, created_at DESC);
CREATE INDEX idx_justifications_reconciliation ON reconciliation_justifications(reconciliation_id);

-- Vista para dashboard de conciliaciones pendientes
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
        WHEN ABS(r.difference) <= 5000 THEN 'AUTO'
        WHEN ABS(r.difference) <= 20000 THEN 'SUPERVISOR'
        WHEN ABS(r.difference) <= 50000 THEN 'MANAGER'
        ELSE 'FINANCE'
    END as required_approval_level
FROM cash_reconciliations r
JOIN users u ON r.cashier_id = u.id
JOIN terminals t ON r.terminal_id = t.id
JOIN locations l ON r.location_id = l.id
LEFT JOIN reconciliation_justifications j ON r.id = j.reconciliation_id
WHERE r.status NOT IN ('CLOSED', 'APPROVED')
GROUP BY r.id, u.name, t.name, l.name;
```

### 4.3 Server Actions para Conciliación

```typescript
// src/actions/reconciliation-v2.ts
'use server';

import { query, pool } from '@/lib/db';
import { z } from 'zod';
import { logAuditEvent } from './audit-v2';

// Schemas de validación
const CreateReconciliationSchema = z.object({
    sessionId: z.string().min(1),
    declaredAmount: z.number().min(0),
    cashierId: z.string().uuid()
});

const AddJustificationSchema = z.object({
    reconciliationId: z.string().uuid(),
    reasonType: z.string().min(1),
    amount: z.number(),
    description: z.string().min(10),
    relatedSaleId: z.string().uuid().optional(),
    relatedMovementId: z.string().uuid().optional(),
    evidenceUrls: z.array(z.string().url()).optional(),
    createdBy: z.string().uuid()
});

// Constantes de tolerancia
const TOLERANCE_LEVELS = {
    AUTO_APPROVE: 5000,
    SUPERVISOR: 20000,
    MANAGER: 50000,
    FINANCE: Infinity
};

export async function createReconciliation(data: z.infer<typeof CreateReconciliationSchema>) {
    const validated = CreateReconciliationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: 'Datos inválidos', details: validated.error.flatten() };
    }

    const { sessionId, declaredAmount, cashierId } = validated.data;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener datos de la sesión
        const sessionRes = await client.query(`
            SELECT 
                s.id,
                s.terminal_id,
                s.opening_amount,
                t.location_id,
                s.opened_at
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.id = $1
        `, [sessionId]);

        if (sessionRes.rowCount === 0) {
            throw new Error('Sesión no encontrada');
        }

        const session = sessionRes.rows[0];
        const openingAmount = Number(session.opening_amount);

        // 2. Calcular ventas en efectivo del turno
        const salesRes = await client.query(`
            SELECT COALESCE(SUM(total_amount), 0) as total
            FROM sales 
            WHERE shift_id = $1 AND payment_method = 'CASH'
        `, [sessionId]);
        const cashSales = Number(salesRes.rows[0].total);

        // 3. Calcular movimientos de caja
        const movementsRes = await client.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('EXTRA_INCOME', 'OPENING') THEN amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN type IN ('WITHDRAWAL', 'EXPENSE') THEN amount ELSE 0 END), 0) as total_out
            FROM cash_movements
            WHERE session_id = $1
        `, [sessionId]);
        
        const movementsIn = Number(movementsRes.rows[0].total_in);
        const movementsOut = Number(movementsRes.rows[0].total_out);

        // 4. Calcular esperado y diferencia
        const expectedAmount = openingAmount + cashSales + movementsIn - movementsOut;
        const difference = declaredAmount - expectedAmount;

        // 5. Determinar estado inicial
        let initialStatus = 'PENDING';
        let approvalLevel = null;
        let approvedBy = null;

        if (difference === 0) {
            initialStatus = 'CLOSED';
        } else if (Math.abs(difference) <= TOLERANCE_LEVELS.AUTO_APPROVE) {
            initialStatus = 'APPROVED';
            approvalLevel = 'AUTO';
            approvedBy = cashierId; // Auto-aprobado
        }

        // 6. Insertar conciliación
        const reconciliationId = crypto.randomUUID();
        await client.query(`
            INSERT INTO cash_reconciliations (
                id, session_id, terminal_id, location_id,
                opening_amount, expected_closing_amount, declared_closing_amount, difference,
                cash_sales_total, cash_movements_in, cash_movements_out,
                status, cashier_id, approved_by, approved_at, approval_level
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7, $8,
                $9, $10, $11,
                $12, $13, $14, $15, $16
            )
        `, [
            reconciliationId, sessionId, session.terminal_id, session.location_id,
            openingAmount, expectedAmount, declaredAmount, difference,
            cashSales, movementsIn, movementsOut,
            initialStatus, cashierId,
            approvedBy, approvedBy ? new Date() : null, approvalLevel
        ]);

        // 7. Actualizar sesión con datos de cierre
        await client.query(`
            UPDATE cash_register_sessions
            SET closing_amount = $1,
                expected_closing_amount = $2,
                difference = $3,
                closed_at = NOW(),
                status = 'CLOSED'
            WHERE id = $4
        `, [declaredAmount, expectedAmount, difference, sessionId]);

        await client.query('COMMIT');

        // 8. Audit log
        await logAuditEvent({
            actionCategory: 'CASH',
            actionType: 'CREATE_RECONCILIATION',
            resourceType: 'RECONCILIATION',
            resourceId: reconciliationId,
            userId: cashierId,
            terminalId: session.terminal_id,
            sessionId: sessionId,
            newValues: {
                declared: declaredAmount,
                expected: expectedAmount,
                difference,
                status: initialStatus
            },
            deltaAmount: difference
        });

        return {
            success: true,
            data: {
                reconciliationId,
                difference,
                status: initialStatus,
                requiresJustification: Math.abs(difference) > 0 && initialStatus !== 'CLOSED'
            }
        };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating reconciliation:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

export async function addJustification(data: z.infer<typeof AddJustificationSchema>) {
    const validated = AddJustificationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: 'Datos inválidos' };
    }

    const { 
        reconciliationId, reasonType, amount, description, 
        relatedSaleId, relatedMovementId, evidenceUrls, createdBy 
    } = validated.data;

    try {
        // Verificar que la conciliación existe y está pendiente
        const reconRes = await query(
            'SELECT id, difference, status FROM cash_reconciliations WHERE id = $1',
            [reconciliationId]
        );

        if (reconRes.rowCount === 0) {
            return { success: false, error: 'Conciliación no encontrada' };
        }

        if (reconRes.rows[0].status === 'CLOSED') {
            return { success: false, error: 'La conciliación ya está cerrada' };
        }

        // Insertar justificación
        const justificationId = crypto.randomUUID();
        await query(`
            INSERT INTO reconciliation_justifications (
                id, reconciliation_id, reason_type, amount, description,
                related_sale_id, related_movement_id, evidence_urls, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            justificationId, reconciliationId, reasonType, amount, description,
            relatedSaleId || null, relatedMovementId || null, 
            evidenceUrls || [], createdBy
        ]);

        // Verificar si la diferencia está completamente justificada
        const totalJustified = await query(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM reconciliation_justifications
            WHERE reconciliation_id = $1
        `, [reconciliationId]);

        const justified = Number(totalJustified.rows[0].total);
        const difference = Number(reconRes.rows[0].difference);

        // Si está completamente justificado, actualizar estado
        if (Math.abs(justified) >= Math.abs(difference)) {
            await query(`
                UPDATE cash_reconciliations 
                SET status = 'JUSTIFIED'
                WHERE id = $1
            `, [reconciliationId]);
        }

        return { 
            success: true, 
            justificationId,
            totalJustified: justified,
            remaining: difference - justified
        };

    } catch (error: any) {
        console.error('Error adding justification:', error);
        return { success: false, error: error.message };
    }
}

export async function approveReconciliation(
    reconciliationId: string, 
    approverId: string, 
    notes?: string
) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Obtener datos actuales
        const reconRes = await client.query(`
            SELECT r.*, u.role as approver_role
            FROM cash_reconciliations r, users u
            WHERE r.id = $1 AND u.id = $2
        `, [reconciliationId, approverId]);

        if (reconRes.rowCount === 0) {
            throw new Error('Conciliación no encontrada');
        }

        const recon = reconRes.rows[0];
        const approverRole = recon.approver_role;

        // Validar nivel de aprobación
        const requiredLevel = Math.abs(recon.difference) <= TOLERANCE_LEVELS.SUPERVISOR 
            ? 'SUPERVISOR'
            : Math.abs(recon.difference) <= TOLERANCE_LEVELS.MANAGER 
                ? 'MANAGER' 
                : 'FINANCE';

        const roleHierarchy = ['CASHIER', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'FINANCE', 'GERENTE_GENERAL'];
        const approverLevel = roleHierarchy.indexOf(approverRole);
        const requiredLevelIndex = roleHierarchy.indexOf(requiredLevel);

        if (approverLevel < requiredLevelIndex) {
            throw new Error(`Se requiere aprobación de ${requiredLevel} o superior`);
        }

        // Actualizar conciliación
        await client.query(`
            UPDATE cash_reconciliations
            SET status = 'APPROVED',
                approved_by = $1,
                approved_at = NOW(),
                approval_level = $2
            WHERE id = $3
        `, [approverId, approverRole, reconciliationId]);

        // Registrar en historial
        await client.query(`
            INSERT INTO reconciliation_approvals (
                reconciliation_id, action, actor_id, actor_role,
                notes, previous_status, new_status
            ) VALUES ($1, 'APPROVE', $2, $3, $4, $5, 'APPROVED')
        `, [reconciliationId, approverId, approverRole, notes, recon.status]);

        await client.query('COMMIT');

        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}
```

---

## 5. Política de Fallbacks y Resiliencia

### 5.1 Matriz de Decisión: Sanear vs Bloquear

```
┌────────────────────────────────────────────────────────────────────────┐
│         POLÍTICA DE FALLBACKS INTELIGENTES - PHARMA-SYNAPSE           │
└────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │  TIPO DE OPERACIÓN  │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   POS EN VIVO   │   │ ADMINISTRACIÓN  │   │  PROCESOS BATCH │
│  (Misión Crit.) │   │   (Gestión)     │   │   (Reportes)    │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ PRIORIDAD:      │   │ PRIORIDAD:      │   │ PRIORIDAD:      │
│ CONTINUIDAD     │   │ INTEGRIDAD      │   │ PRECISIÓN       │
│                 │   │                 │   │                 │
│ • Sanear datos  │   │ • Validar antes │   │ • Fallar si     │
│ • Log warning   │   │ • Bloquear si   │   │   datos malos   │
│ • Continuar     │   │   inconsistente │   │ • Re-intentar   │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### 5.2 Ejemplos Detallados por Módulo

#### POS EN VIVO - Política: "Sanear y Continuar"

```typescript
// src/lib/fallbacks/pos-fallbacks.ts

/**
 * Política POS: La venta DEBE completarse si es humanamente posible.
 * Solo bloquear en casos de fraude potencial o error irrecuperable.
 */

interface FallbackResult<T> {
    success: boolean;
    data?: T;
    fallbackApplied?: string;
    originalError?: string;
    requiresReview: boolean;
}

// CASO 1: Terminal ID inválido durante venta
export async function handleInvalidTerminalId(
    terminalId: string, 
    userId: string, 
    sale: SaleTransaction
): Promise<FallbackResult<string>> {
    
    // Intentar recuperar terminal por usuario
    const fallbackTerminal = await query(`
        SELECT t.id FROM terminals t
        JOIN cash_register_sessions s ON t.id = s.terminal_id
        WHERE s.user_id = $1 AND s.status = 'OPEN'
        LIMIT 1
    `, [userId]);

    if (fallbackTerminal.rows.length > 0) {
        // Log el fallback pero continuar
        await logAuditEvent({
            actionCategory: 'SALE',
            actionType: 'FALLBACK_TERMINAL_RECOVERY',
            userId,
            oldValues: { terminal_id: terminalId },
            newValues: { terminal_id: fallbackTerminal.rows[0].id },
            requiresManagerReview: true
        });

        return {
            success: true,
            data: fallbackTerminal.rows[0].id,
            fallbackApplied: 'TERMINAL_BY_USER_SESSION',
            originalError: `Invalid terminal ID: ${terminalId}`,
            requiresReview: true
        };
    }

    // Si no hay fallback, BLOQUEAR (podría ser fraude)
    return {
        success: false,
        originalError: 'No se puede identificar el terminal de venta',
        requiresReview: true
    };
}

// CASO 2: Stock negativo en descuento
export async function handleNegativeStock(
    batchId: string,
    requestedQty: number,
    currentStock: number
): Promise<FallbackResult<number>> {
    
    // Política: Permitir venta, registrar discrepancia para inventario
    // Razón: El stock del sistema puede estar desactualizado
    
    await logAuditEvent({
        actionCategory: 'INVENTORY',
        actionType: 'STOCK_DISCREPANCY_SALE',
        resourceType: 'BATCH',
        resourceId: batchId,
        newValues: {
            requested: requestedQty,
            available: currentStock,
            deficit: requestedQty - currentStock
        },
        requiresManagerReview: true
    });

    // Crear ticket de inventario automático
    await createInventoryAdjustmentTask(batchId, requestedQty - currentStock);

    return {
        success: true,
        data: requestedQty, // Permitir la venta
        fallbackApplied: 'ALLOW_NEGATIVE_STOCK',
        requiresReview: true
    };
}

// CASO 3: Sesión no encontrada
export async function handleOrphanSale(
    terminalId: string,
    userId: string,
    sale: SaleTransaction
): Promise<FallbackResult<string>> {
    
    // Crear sesión de emergencia
    const emergencySessionId = `EMERGENCY-${Date.now()}`;
    
    await query(`
        INSERT INTO cash_register_sessions (
            id, terminal_id, user_id, opening_amount, 
            status, opened_at, notes
        ) VALUES (
            $1, $2, $3, 0,
            'EMERGENCY', NOW(), 
            'Sesión de emergencia creada automáticamente para venta sin sesión activa'
        )
    `, [emergencySessionId, terminalId, userId]);

    await logAuditEvent({
        actionCategory: 'CASH',
        actionType: 'EMERGENCY_SESSION_CREATED',
        sessionId: emergencySessionId,
        terminalId,
        userId,
        requiresManagerReview: true
    });

    return {
        success: true,
        data: emergencySessionId,
        fallbackApplied: 'EMERGENCY_SESSION',
        requiresReview: true
    };
}
```

#### ADMINISTRACIÓN - Política: "Validar y Bloquear"

```typescript
// src/lib/fallbacks/admin-fallbacks.ts

/**
 * Política Admin: La integridad de datos es prioritaria.
 * Mejor bloquear y pedir intervención que corromper datos.
 */

// CASO 1: Crear terminal con location_id inválido
export async function validateTerminalCreation(
    data: CreateTerminalInput
): Promise<FallbackResult<void>> {
    
    // Validación estricta - NO fallback
    const locationExists = await query(
        'SELECT id FROM locations WHERE id = $1',
        [data.location_id]
    );

    if (locationExists.rowCount === 0) {
        return {
            success: false,
            originalError: `Location ID ${data.location_id} no existe en el sistema`,
            requiresReview: false // No es un error de datos, es input inválido
        };
    }

    // Verificar duplicados
    const duplicateCheck = await query(`
        SELECT id FROM terminals 
        WHERE location_id = $1 AND name = $2 AND deleted_at IS NULL
    `, [data.location_id, data.name]);

    if (duplicateCheck.rowCount > 0) {
        return {
            success: false,
            originalError: `Ya existe un terminal "${data.name}" en esta ubicación`,
            requiresReview: false
        };
    }

    return { success: true, requiresReview: false };
}

// CASO 2: Cierre forzado de sesión
export async function validateForceClose(
    terminalId: string,
    requestingUserId: string
): Promise<FallbackResult<void>> {
    
    // Verificar permisos estrictos
    const userRole = await query(
        'SELECT role FROM users WHERE id = $1',
        [requestingUserId]
    );

    const allowedRoles = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'];
    
    if (!allowedRoles.includes(userRole.rows[0]?.role)) {
        return {
            success: false,
            originalError: 'No tiene permisos para cierre forzado',
            requiresReview: true // Log intento no autorizado
        };
    }

    // Verificar que hay sesión que cerrar
    const sessionExists = await query(`
        SELECT id, user_id FROM cash_register_sessions
        WHERE terminal_id = $1 AND status = 'OPEN'
    `, [terminalId]);

    if (sessionExists.rowCount === 0) {
        return {
            success: false,
            originalError: 'No hay sesión activa que cerrar',
            requiresReview: false
        };
    }

    return { success: true, requiresReview: false };
}
```

#### PROCESOS BATCH - Política: "Fallar y Re-intentar"

```typescript
// src/lib/fallbacks/batch-fallbacks.ts

/**
 * Política Batch: La precisión es crítica para reportes fiscales.
 * Si hay error, fallar, loggear, y programar re-intento.
 */

// CASO 1: Generación de reporte de conciliación diaria
export async function generateDailyReconciliationReport(
    locationId: string,
    date: Date
): Promise<FallbackResult<ReportData>> {
    
    try {
        // Verificar que todas las sesiones del día están cerradas
        const openSessions = await query(`
            SELECT COUNT(*) as count
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE t.location_id = $1
              AND DATE(s.opened_at) = $2
              AND s.status = 'OPEN'
        `, [locationId, date]);

        if (Number(openSessions.rows[0].count) > 0) {
            // NO generar reporte incompleto
            return {
                success: false,
                originalError: `Hay ${openSessions.rows[0].count} sesiones abiertas. El reporte no puede generarse.`,
                requiresReview: true
            };
        }

        // Verificar conciliaciones pendientes
        const pendingReconciliations = await query(`
            SELECT COUNT(*) as count
            FROM cash_reconciliations r
            WHERE r.location_id = $1
              AND DATE(r.created_at) = $2
              AND r.status NOT IN ('APPROVED', 'CLOSED')
        `, [locationId, date]);

        if (Number(pendingReconciliations.rows[0].count) > 0) {
            // Generar reporte PARCIAL con advertencia
            await logAuditEvent({
                actionCategory: 'REPORT',
                actionType: 'PARTIAL_REPORT_GENERATED',
                newValues: {
                    pending_reconciliations: pendingReconciliations.rows[0].count
                },
                requiresManagerReview: true
            });

            // Continuar pero marcar como parcial
            const report = await buildReport(locationId, date);
            report.isPartial = true;
            report.warnings.push(`${pendingReconciliations.rows[0].count} conciliaciones pendientes de aprobación`);

            return {
                success: true,
                data: report,
                fallbackApplied: 'PARTIAL_REPORT',
                requiresReview: true
            };
        }

        const report = await buildReport(locationId, date);
        return { success: true, data: report, requiresReview: false };

    } catch (error: any) {
        // Programar re-intento
        await scheduleRetry('generateDailyReconciliationReport', {
            locationId,
            date,
            retryCount: 0,
            maxRetries: 3
        });

        return {
            success: false,
            originalError: error.message,
            requiresReview: true
        };
    }
}
```

### 5.3 Tabla Resumen de Políticas

| Módulo | Error | Acción | Continúa? | Requiere Review? |
|--------|-------|--------|-----------|------------------|
| **POS** | Terminal ID inválido | Buscar por sesión usuario | ✅ | ✅ |
| **POS** | Stock negativo | Permitir, crear ticket | ✅ | ✅ |
| **POS** | Sesión no existe | Crear sesión emergencia | ✅ | ✅ |
| **POS** | DTE rechazado | Completar venta, marcar DTE pending | ✅ | ✅ |
| **Admin** | Location ID inválido | Bloquear creación | ❌ | ❌ |
| **Admin** | Usuario sin permisos | Bloquear acción | ❌ | ✅ |
| **Admin** | Sesión duplicada | Bloquear apertura | ❌ | ❌ |
| **Batch** | Sesiones abiertas | No generar reporte | ❌ | ✅ |
| **Batch** | Conciliaciones pending | Generar reporte parcial | ⚠️ | ✅ |
| **Batch** | Error de BD | Re-intentar 3x | ❌ | ✅ |

---

## 6. Recomendaciones de Implementación

### 6.1 Cambios en Modelo de Datos

#### Prioridad Alta (Sprint 1-2)

```sql
-- 1. Normalizar IDs a UUID (Migración crítica)
-- Ver sección R001 para script completo

-- 2. Agregar columnas faltantes a cash_register_sessions
ALTER TABLE cash_register_sessions
ADD COLUMN IF NOT EXISTS expected_closing_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS reconciliation_id UUID,
ADD COLUMN IF NOT EXISTS emergency_flag BOOLEAN DEFAULT FALSE;

-- 3. Constraint de stock no negativo
ALTER TABLE inventory_batches
ADD CONSTRAINT chk_stock_non_negative CHECK (quantity_real >= -100);
-- -100 como buffer para evitar bloqueos en producción, ajustar según tolerancia

-- 4. Vincular ventas a sesiones (FK)
ALTER TABLE sales 
ALTER COLUMN shift_id SET NOT NULL,
ADD CONSTRAINT fk_sales_session FOREIGN KEY (shift_id) 
    REFERENCES cash_register_sessions(id);
```

#### Prioridad Media (Sprint 3-4)

```sql
-- 5. Tabla de auditoría mejorada
-- Ver sección 3.1 para DDL completo

-- 6. Tablas de conciliación
-- Ver sección 4.2 para DDL completo

-- 7. Tabla de revisiones pendientes de usuario
CREATE TABLE user_pending_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    reason VARCHAR(50) NOT NULL,
    session_id VARCHAR(50),
    sale_id UUID,
    details JSONB,
    status VARCHAR(20) DEFAULT 'PENDING',
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, session_id)
);
```

### 6.2 Cambios en Capa de Aplicación

#### Server Actions Críticas

```typescript
// 1. Wrapper de auditoría automática
// src/lib/audit-wrapper.ts

import { logAuditEvent } from '@/actions/audit-v2';
import { headers } from 'next/headers';

export function withAudit<T extends (...args: any[]) => Promise<any>>(
    actionCategory: string,
    actionType: string,
    fn: T
): T {
    return (async (...args: Parameters<T>) => {
        const headersList = headers();
        const ip = headersList.get('x-forwarded-for') || 'unknown';
        const userAgent = headersList.get('user-agent') || 'unknown';
        
        const startTime = Date.now();
        let result;
        let status = 'SUCCESS';
        
        try {
            result = await fn(...args);
            if (result?.success === false) {
                status = 'FAILED';
            }
            return result;
        } catch (error) {
            status = 'FAILED';
            throw error;
        } finally {
            // Log asíncrono, no bloquea respuesta
            logAuditEvent({
                actionCategory,
                actionType,
                actionStatus: status,
                ipAddress: ip,
                userAgent,
                newValues: { 
                    args: JSON.stringify(args).substring(0, 1000),
                    duration_ms: Date.now() - startTime
                }
            }).catch(console.error);
        }
    }) as T;
}

// Uso:
export const createSale = withAudit('SALE', 'CREATE_SALE', async (saleData) => {
    // ... implementación existente
});
```

#### Middleware de Validación de Sesión

```typescript
// src/middleware.ts (actualización)

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
    // Rutas que requieren sesión de caja activa
    const posRoutes = ['/pos', '/api/sales', '/api/cash'];
    
    if (posRoutes.some(route => request.nextUrl.pathname.startsWith(route))) {
        const sessionToken = request.cookies.get('pos_session_id');
        
        if (!sessionToken) {
            // Redirigir a selector de terminal
            return NextResponse.redirect(new URL('/pos/select-terminal', request.url));
        }
        
        // Validar sesión en BD (via API interna)
        const validationResponse = await fetch(
            `${request.nextUrl.origin}/api/terminals/validate-session`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sessionToken.value })
            }
        );
        
        const validation = await validationResponse.json();
        
        if (!validation.valid) {
            // Sesión inválida o zombie
            const response = NextResponse.redirect(
                new URL('/pos/session-expired', request.url)
            );
            response.cookies.delete('pos_session_id');
            return response;
        }
        
        // Agregar contexto a headers para uso downstream
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-terminal-id', validation.terminalId);
        requestHeaders.set('x-session-id', validation.sessionId);
        requestHeaders.set('x-user-id', validation.userId);
        
        return NextResponse.next({
            request: { headers: requestHeaders }
        });
    }
    
    return NextResponse.next();
}

export const config = {
    matcher: ['/pos/:path*', '/api/sales/:path*', '/api/cash/:path*']
};
```

---

## 7. Monitoreo y Alertas

### 7.1 Métricas Críticas a Monitorear

```typescript
// src/lib/monitoring/metrics.ts

export const CRITICAL_METRICS = {
    // Sesiones
    zombieSessions: {
        query: `SELECT COUNT(*) FROM v_zombie_sessions`,
        threshold: 0,
        severity: 'HIGH',
        alertChannel: 'MANAGER'
    },
    
    // Conciliaciones
    pendingReconciliations: {
        query: `SELECT COUNT(*) FROM cash_reconciliations WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '4 hours'`,
        threshold: 0,
        severity: 'HIGH',
        alertChannel: 'FINANCE'
    },
    
    // Diferencias grandes
    largeDiscrepancies: {
        query: `SELECT COUNT(*) FROM cash_reconciliations WHERE ABS(difference) > 50000 AND status != 'CLOSED'`,
        threshold: 0,
        severity: 'CRITICAL',
        alertChannel: 'GERENTE_GENERAL'
    },
    
    // Stock negativo
    negativeStock: {
        query: `SELECT COUNT(*) FROM inventory_batches WHERE quantity_real < 0`,
        threshold: 0,
        severity: 'MEDIUM',
        alertChannel: 'INVENTORY'
    },
    
    // Ventas sin DTE
    salesWithoutDTE: {
        query: `SELECT COUNT(*) FROM sales WHERE dte_folio IS NULL AND timestamp > NOW() - INTERVAL '24 hours'`,
        threshold: 10,
        severity: 'HIGH',
        alertChannel: 'SII'
    },
    
    // Fallbacks aplicados
    fallbacksToday: {
        query: `SELECT COUNT(*) FROM audit_events WHERE action_type LIKE 'FALLBACK_%' AND created_at > NOW() - INTERVAL '24 hours'`,
        threshold: 5,
        severity: 'MEDIUM',
        alertChannel: 'TECH'
    }
};
```

### 7.2 Cron Job de Monitoreo

```typescript
// src/scripts/monitoring-cron.ts

import { CRITICAL_METRICS } from '@/lib/monitoring/metrics';
import { query } from '@/lib/db';
import { sendAlert } from '@/lib/notifications';

export async function runHealthCheck() {
    const alerts: Alert[] = [];
    
    for (const [metricName, config] of Object.entries(CRITICAL_METRICS)) {
        try {
            const result = await query(config.query);
            const value = Number(result.rows[0].count);
            
            if (value > config.threshold) {
                alerts.push({
                    metric: metricName,
                    value,
                    threshold: config.threshold,
                    severity: config.severity,
                    channel: config.alertChannel,
                    timestamp: new Date()
                });
            }
        } catch (error) {
            // Error en query de métricas es crítico
            alerts.push({
                metric: metricName,
                value: -1,
                severity: 'CRITICAL',
                channel: 'TECH',
                error: error.message,
                timestamp: new Date()
            });
        }
    }
    
    // Enviar alertas agrupadas por canal
    const alertsByChannel = groupBy(alerts, 'channel');
    
    for (const [channel, channelAlerts] of Object.entries(alertsByChannel)) {
        await sendAlert(channel, {
            subject: `[Pharma-Synapse] ${channelAlerts.length} alertas activas`,
            alerts: channelAlerts
        });
    }
    
    return alerts;
}

// Programar cada 15 minutos en producción
// cron: "*/15 * * * *"
```

### 7.3 Dashboard de Salud del Sistema

```sql
-- Vista consolidada para dashboard de operaciones
CREATE OR REPLACE VIEW v_system_health AS
SELECT 
    'zombie_sessions' as metric,
    (SELECT COUNT(*) FROM v_zombie_sessions) as value,
    0 as threshold,
    CASE WHEN (SELECT COUNT(*) FROM v_zombie_sessions) > 0 THEN 'ALERT' ELSE 'OK' END as status
UNION ALL
SELECT 
    'pending_reconciliations',
    (SELECT COUNT(*) FROM cash_reconciliations WHERE status = 'PENDING'),
    0,
    CASE WHEN (SELECT COUNT(*) FROM cash_reconciliations WHERE status = 'PENDING') > 0 THEN 'WARNING' ELSE 'OK' END
UNION ALL
SELECT 
    'negative_stock_items',
    (SELECT COUNT(*) FROM inventory_batches WHERE quantity_real < 0),
    0,
    CASE WHEN (SELECT COUNT(*) FROM inventory_batches WHERE quantity_real < 0) > 0 THEN 'WARNING' ELSE 'OK' END
UNION ALL
SELECT 
    'active_terminals',
    (SELECT COUNT(*) FROM terminals WHERE status = 'OPEN' AND deleted_at IS NULL),
    NULL,
    'INFO'
UNION ALL
SELECT 
    'sales_today',
    (SELECT COUNT(*) FROM sales WHERE timestamp > NOW() - INTERVAL '24 hours'),
    NULL,
    'INFO';
```

---

## 8. Anexos Técnicos

### 8.1 Checklist de Implementación

#### Fase 1: Fundamentos (Semana 1-2)
- [ ] Backup completo de base de datos
- [ ] Migración de IDs TEXT → UUID
- [ ] Agregar columnas faltantes a tablas
- [ ] Crear tabla `audit_events`
- [ ] Implementar wrapper de auditoría
- [ ] Tests de regresión

#### Fase 2: Conciliación (Semana 3-4)
- [ ] Crear tablas de conciliación
- [ ] Implementar Server Actions de conciliación
- [ ] UI de arqueo para cajeros
- [ ] UI de aprobación para managers
- [ ] Tests E2E de flujo completo

#### Fase 3: Fallbacks (Semana 5-6)
- [ ] Implementar fallbacks de POS
- [ ] Implementar validaciones de Admin
- [ ] Implementar lógica batch con re-intentos
- [ ] Crear sistema de tickets de revisión
- [ ] Tests de escenarios de error

#### Fase 4: Monitoreo (Semana 7-8)
- [ ] Crear vistas de monitoreo
- [ ] Configurar cron jobs
- [ ] Integrar sistema de alertas
- [ ] Dashboard de operaciones
- [ ] Documentación de runbooks

### 8.2 Scripts de Migración

Los scripts SQL completos están disponibles en:
- `/docs/migrations/001_normalize_uuids.sql`
- `/docs/migrations/002_audit_tables.sql`
- `/docs/migrations/003_reconciliation_tables.sql`
- `/docs/migrations/004_add_constraints.sql`

### 8.3 Glosario

| Término | Definición |
|---------|------------|
| **Arqueo** | Conteo físico del dinero en caja al cierre de turno |
| **Conciliación** | Proceso de comparar y justificar diferencias entre arqueo teórico y físico |
| **DTE** | Documento Tributario Electrónico (boleta, factura) |
| **Zombie Session** | Sesión de caja que quedó abierta por error/timeout |
| **Fallback** | Mecanismo de recuperación ante errores |
| **Remesa** | Transferencia de efectivo de caja a caja fuerte |

---

**Documento preparado por:** Arquitecto de Software Senior  
**Revisado por:** [Pendiente]  
**Próxima revisión:** 2026-01-23

---

*Este documento es confidencial y de uso exclusivo para el equipo de desarrollo de Farmacias Vallenar.*
