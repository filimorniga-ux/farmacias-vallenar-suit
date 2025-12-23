# PROMPT ANTIGRAVITY: Fase 2 - Sistema de Auditoría y Conciliación Avanzada

## ROL
Actúa como **Ingeniero de Software Senior** especializado en sistemas financieros críticos y auditoría fiscal.

## CONTEXTO
El sistema **Pharma-Synapse v3.1** ya completó la **Fase 1 de Estabilización**:
- ✅ Migración 003 aplicada (FKs, constraints, UUIDs)
- ✅ `openTerminalAtomic` con SERIALIZABLE isolation
- ✅ `closeTerminalAtomic` implementado
- ✅ CLI de diagnóstico (`npm run terminals:health`)
- ✅ Hook `useTerminalSession` 
- ✅ `ReconciliationModal` básico

**LO QUE FALTA (Fase 2):**
- ❌ Sistema de auditoría (`audit_log` tabla + triggers)
- ❌ Registro de auditoría en operaciones existentes
- ❌ Conciliación con justificaciones estructuradas
- ❌ Detección de patrones de diferencias

---

## DOCUMENTACIÓN DE REFERENCIA
**LEER ANTES DE COMENZAR:**
- `docs/ARQUITECTURA_AUDIT_FINANCIERO_v3.1.md` - Análisis completo
- `src/db/migrations/003_fix_terminals_integrity.sql` - Ya aplicada (referencia)
- `src/actions/terminals-v2.ts` - Implementación actual de atomicidad

---

# TAREAS A EJECUTAR

---

## 🛠️ TAREA 1: Crear Sistema de Auditoría (BD)

### 1.1 Crear migración `src/db/migrations/005_audit_system.sql`

```sql
-- =====================================================
-- MIGRACIÓN 005: Sistema de Auditoría Forense
-- Pharma-Synapse v3.1
-- =====================================================

BEGIN;

-- 1. Catálogo de Acciones Auditables
CREATE TABLE IF NOT EXISTS audit_action_catalog (
    code VARCHAR(50) PRIMARY KEY,
    category VARCHAR(30) NOT NULL CHECK (category IN ('FINANCIAL', 'SECURITY', 'OPERATIONAL', 'COMPLIANCE')),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description TEXT NOT NULL,
    requires_justification BOOLEAN DEFAULT FALSE,
    retention_days INTEGER DEFAULT 2555
);

-- Insertar catálogo
INSERT INTO audit_action_catalog (code, category, severity, description, requires_justification) VALUES
    ('SALE_CREATE', 'FINANCIAL', 'MEDIUM', 'Venta registrada', FALSE),
    ('SALE_VOID', 'FINANCIAL', 'CRITICAL', 'Anulación de venta', TRUE),
    ('SALE_REFUND', 'FINANCIAL', 'HIGH', 'Devolución procesada', TRUE),
    ('SESSION_OPEN', 'OPERATIONAL', 'MEDIUM', 'Apertura de sesión de caja', FALSE),
    ('SESSION_CLOSE', 'OPERATIONAL', 'MEDIUM', 'Cierre de sesión de caja', FALSE),
    ('SESSION_FORCE_CLOSE', 'SECURITY', 'CRITICAL', 'Cierre forzado administrativo', TRUE),
    ('SESSION_AUTO_CLOSE', 'OPERATIONAL', 'HIGH', 'Cierre automático por timeout', FALSE),
    ('RECONCILIATION', 'FINANCIAL', 'CRITICAL', 'Conciliación de arqueo', TRUE),
    ('RECONCILIATION_JUSTIFY', 'FINANCIAL', 'HIGH', 'Justificación de diferencia', TRUE),
    ('CASH_MOVEMENT', 'FINANCIAL', 'MEDIUM', 'Movimiento de efectivo', FALSE),
    ('PRICE_CHANGE', 'FINANCIAL', 'CRITICAL', 'Cambio de precio', TRUE),
    ('STOCK_ADJUST', 'FINANCIAL', 'HIGH', 'Ajuste de inventario', TRUE),
    ('USER_LOGIN', 'SECURITY', 'LOW', 'Inicio de sesión', FALSE),
    ('USER_LOGIN_FAILED', 'SECURITY', 'HIGH', 'Intento fallido de login', FALSE),
    ('CONFIG_CHANGE', 'OPERATIONAL', 'HIGH', 'Cambio de configuración', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. Tabla Principal de Auditoría
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    -- Contexto de usuario
    user_id UUID,
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    
    -- Contexto de sesión
    session_id UUID,
    terminal_id UUID,
    location_id UUID,
    
    -- Acción
    action_code VARCHAR(50) REFERENCES audit_action_catalog(code),
    
    -- Entidad afectada
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    
    -- Datos de cambio
    old_values JSONB,
    new_values JSONB,
    metadata JSONB,
    
    -- Justificación (obligatoria para acciones críticas)
    justification TEXT,
    
    -- Trazabilidad técnica
    ip_address INET,
    user_agent TEXT
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action_code);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_session ON audit_log(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_terminal ON audit_log(terminal_id) WHERE terminal_id IS NOT NULL;

-- 4. Vista de actividad sospechosa
CREATE OR REPLACE VIEW v_suspicious_activity AS
SELECT 
    al.created_at,
    al.user_name,
    al.user_role,
    al.action_code,
    ac.description,
    ac.severity,
    al.entity_type,
    al.entity_id,
    al.justification,
    al.ip_address
FROM audit_log al
JOIN audit_action_catalog ac ON al.action_code = ac.code
WHERE ac.severity IN ('HIGH', 'CRITICAL')
ORDER BY al.created_at DESC;

-- 5. Registrar migración
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO schema_migrations (version, description)
VALUES ('005_audit_system', 'Sistema de auditoría forense')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
```

### 1.2 Ejecutar migración

```bash
psql $DATABASE_URL -f src/db/migrations/005_audit_system.sql
```

### 1.3 Verificar

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('audit_log', 'audit_action_catalog');
-- Debe retornar 2 filas
```

**CHECKPOINT:** Confirma que las tablas existen.

---

## 🛠️ TAREA 2: Crear Adaptador de Auditoría (TypeScript)

### 2.1 Crear `src/lib/audit.ts`

```typescript
'use server';

import { query } from '@/lib/db';
import { headers } from 'next/headers';

export type AuditAction = 
    | 'SALE_CREATE' | 'SALE_VOID' | 'SALE_REFUND'
    | 'SESSION_OPEN' | 'SESSION_CLOSE' | 'SESSION_FORCE_CLOSE' | 'SESSION_AUTO_CLOSE'
    | 'RECONCILIATION' | 'RECONCILIATION_JUSTIFY'
    | 'CASH_MOVEMENT' | 'PRICE_CHANGE' | 'STOCK_ADJUST'
    | 'USER_LOGIN' | 'USER_LOGIN_FAILED' | 'CONFIG_CHANGE';

export interface AuditContext {
    userId?: string;
    userName?: string;
    userRole?: string;
    sessionId?: string;
    terminalId?: string;
    locationId?: string;
}

export interface AuditPayload {
    action: AuditAction;
    entityType: string;
    entityId: string;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
    metadata?: Record<string, any>;
    justification?: string;
}

const CRITICAL_ACTIONS: AuditAction[] = [
    'SALE_VOID', 'SESSION_FORCE_CLOSE', 'RECONCILIATION', 'PRICE_CHANGE'
];

/**
 * Registra una acción en el log de auditoría
 */
export async function auditLog(
    context: AuditContext,
    payload: AuditPayload
): Promise<{ success: boolean; auditId?: string; error?: string }> {
    try {
        // Validar justificación para acciones críticas
        if (CRITICAL_ACTIONS.includes(payload.action)) {
            if (!payload.justification || payload.justification.length < 10) {
                return { 
                    success: false, 
                    error: `La acción ${payload.action} requiere justificación (mín. 10 caracteres)` 
                };
            }
        }

        let ipAddress = 'UNKNOWN';
        let userAgent = 'UNKNOWN';
        
        try {
            const headersList = headers();
            ipAddress = headersList.get('x-forwarded-for') || 
                        headersList.get('x-real-ip') || 'UNKNOWN';
            userAgent = headersList.get('user-agent') || 'UNKNOWN';
        } catch (e) {
            // Puede fallar fuera de contexto de request
        }

        const result = await query(`
            INSERT INTO audit_log (
                user_id, user_name, user_role,
                session_id, terminal_id, location_id,
                action_code, entity_type, entity_id,
                old_values, new_values, metadata,
                justification, ip_address, user_agent
            ) VALUES (
                $1::uuid, $2, $3,
                $4::uuid, $5::uuid, $6::uuid,
                $7, $8, $9,
                $10::jsonb, $11::jsonb, $12::jsonb,
                $13, $14::inet, $15
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
            ipAddress !== 'UNKNOWN' ? ipAddress : null,
            userAgent
        ]);

        return { success: true, auditId: result.rows[0].id };

    } catch (error: any) {
        console.error('🚨 AUDIT LOG FAILED:', error);
        
        if (CRITICAL_ACTIONS.includes(payload.action)) {
            throw new Error(`AUDIT_CRITICAL_FAILURE: ${error.message}`);
        }
        
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene actividad reciente de auditoría
 */
export async function getRecentAuditActivity(limit = 50) {
    try {
        const result = await query(`
            SELECT 
                al.*,
                ac.description,
                ac.severity,
                ac.category
            FROM audit_log al
            JOIN audit_action_catalog ac ON al.action_code = ac.code
            ORDER BY al.created_at DESC
            LIMIT $1
        `, [limit]);
        
        return { success: true, data: result.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene actividad sospechosa (HIGH/CRITICAL)
 */
export async function getSuspiciousActivity(hours = 24) {
    try {
        const result = await query(`
            SELECT * FROM v_suspicious_activity
            WHERE created_at > NOW() - INTERVAL '${hours} hours'
            LIMIT 100
        `);
        
        return { success: true, data: result.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

**CHECKPOINT:** Verificar que el archivo compila sin errores.

---

## 🛠️ TAREA 3: Integrar Auditoría en `terminals-v2.ts`

### 3.1 Agregar import al inicio de `src/actions/terminals-v2.ts`

```typescript
import { auditLog } from '@/lib/audit';
```

### 3.2 Agregar auditoría en `openTerminalAtomic`

Buscar el `COMMIT` exitoso y agregar **DESPUÉS** del commit (fuera de la transacción):

```typescript
// Después del await client.query('COMMIT');

// Auditoría (asíncrona, no bloquea)
auditLog(
    {
        userId,
        terminalId,
        locationId: terminal.location_id,
        sessionId
    },
    {
        action: 'SESSION_OPEN',
        entityType: 'SESSION',
        entityId: sessionId,
        newValues: { opening_amount: initialCash }
    }
).catch(e => console.error('Audit log failed:', e));
```

### 3.3 Agregar auditoría en `closeTerminalAtomic`

Similar, después del COMMIT:

```typescript
auditLog(
    {
        userId,
        terminalId,
        locationId: terminal.location_id,
        sessionId: session.id
    },
    {
        action: 'SESSION_CLOSE',
        entityType: 'SESSION',
        entityId: session.id,
        newValues: { closing_amount: finalCash, comments }
    }
).catch(e => console.error('Audit log failed:', e));
```

### 3.4 Agregar auditoría en force close (si existe)

Para cierres forzados, la justificación es **obligatoria**:

```typescript
auditLog(
    {
        userId: adminUserId,
        terminalId,
        sessionId: oldSession?.id
    },
    {
        action: 'SESSION_FORCE_CLOSE',
        entityType: 'SESSION',
        entityId: oldSession?.id || terminalId,
        oldValues: oldSession ? { status: oldSession.status, user_id: oldSession.user_id } : null,
        newValues: { status: 'CLOSED_FORCE' },
        justification: reason // OBLIGATORIO
    }
);
```

**CHECKPOINT:** Abrir y cerrar un terminal, verificar que aparece en `audit_log`.

---

## 🛠️ TAREA 4: Crear Migración de Conciliación Avanzada

### 4.1 Crear `src/db/migrations/006_reconciliation_advanced.sql`

```sql
BEGIN;

-- 1. Tabla de Conciliaciones
CREATE TABLE IF NOT EXISTS cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE,
    terminal_id UUID NOT NULL,
    location_id UUID NOT NULL,
    
    -- Valores calculados
    theoretical_amount NUMERIC(15,2) NOT NULL,
    opening_amount NUMERIC(15,2) NOT NULL,
    cash_sales_total NUMERIC(15,2) DEFAULT 0,
    cash_movements_in NUMERIC(15,2) DEFAULT 0,
    cash_movements_out NUMERIC(15,2) DEFAULT 0,
    
    -- Valor declarado
    declared_amount NUMERIC(15,2) NOT NULL,
    
    -- Diferencia (generada)
    difference NUMERIC(15,2) GENERATED ALWAYS AS (declared_amount - theoretical_amount) STORED,
    
    -- Estado
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED')),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID,
    approval_notes TEXT
);

-- 2. Tabla de Justificaciones
CREATE TABLE IF NOT EXISTS reconciliation_justifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id),
    
    justification_type VARCHAR(50) NOT NULL CHECK (justification_type IN (
        'COUNTING_ERROR', 'CHANGE_GIVEN_WRONG', 'SALE_NOT_RECORDED',
        'MOVEMENT_NOT_RECORDED', 'THEFT_SUSPECTED', 'SYSTEM_ERROR',
        'COINS_STUCK', 'ROUNDING', 'OTHER'
    )),
    
    description TEXT NOT NULL CHECK (LENGTH(description) >= 20),
    amount_justified NUMERIC(15,2) NOT NULL,
    evidence_urls TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL,
    
    validated_at TIMESTAMP WITH TIME ZONE,
    validated_by UUID,
    validation_status VARCHAR(20) CHECK (validation_status IN ('ACCEPTED', 'REJECTED', 'PARTIAL'))
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_reconciliations_session ON cash_reconciliations(session_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON cash_reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_reconciliations_pending ON cash_reconciliations(created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_justifications_reconciliation ON reconciliation_justifications(reconciliation_id);

-- 4. Vista de conciliaciones pendientes
CREATE OR REPLACE VIEW v_pending_reconciliations AS
SELECT 
    cr.*,
    (SELECT COALESCE(SUM(amount_justified), 0) FROM reconciliation_justifications rj WHERE rj.reconciliation_id = cr.id) as total_justified,
    ABS(cr.difference) - (SELECT COALESCE(SUM(amount_justified), 0) FROM reconciliation_justifications rj WHERE rj.reconciliation_id = cr.id) as pending_justification
FROM cash_reconciliations cr
WHERE cr.status = 'PENDING'
ORDER BY ABS(cr.difference) DESC;

-- 5. Registrar migración
INSERT INTO schema_migrations (version, description)
VALUES ('006_reconciliation_advanced', 'Conciliación con justificaciones')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
```

### 4.2 Ejecutar

```bash
psql $DATABASE_URL -f src/db/migrations/006_reconciliation_advanced.sql
```

---

## 🛠️ TAREA 5: Crear Server Action de Conciliación

### 5.1 Crear `src/actions/reconciliation.ts`

```typescript
'use server';

import { query, pool } from '@/lib/db';
import { auditLog } from '@/lib/audit';
import { z } from 'zod';

const CreateReconciliationSchema = z.object({
    sessionId: z.string().uuid(),
    declaredAmount: z.number().min(0),
    userId: z.string().uuid()
});

export async function createReconciliation(input: z.infer<typeof CreateReconciliationSchema>) {
    const validated = CreateReconciliationSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, error: validated.error.errors[0].message };
    }

    const { sessionId, declaredAmount, userId } = validated.data;

    try {
        // 1. Obtener datos de sesión
        const sessionData = await query(`
            SELECT 
                s.id, s.terminal_id, t.location_id, s.opening_amount,
                COALESCE((
                    SELECT SUM(total_amount) FROM sales 
                    WHERE terminal_id = s.terminal_id 
                    AND payment_method = 'CASH'
                    AND timestamp BETWEEN s.opened_at AND COALESCE(s.closed_at, NOW())
                ), 0) AS cash_sales,
                COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = s.id AND type = 'EXTRA_INCOME'), 0) AS movements_in,
                COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = s.id AND type IN ('WITHDRAWAL', 'EXPENSE')), 0) AS movements_out
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.id = $1::uuid
        `, [sessionId]);

        if (sessionData.rowCount === 0) {
            return { success: false, error: 'Sesión no encontrada' };
        }

        const session = sessionData.rows[0];
        const theoreticalAmount = 
            Number(session.opening_amount) +
            Number(session.cash_sales) +
            Number(session.movements_in) -
            Number(session.movements_out);

        const difference = declaredAmount - theoreticalAmount;

        // 2. Crear conciliación
        const result = await query(`
            INSERT INTO cash_reconciliations (
                session_id, terminal_id, location_id,
                theoretical_amount, opening_amount,
                cash_sales_total, cash_movements_in, cash_movements_out,
                declared_amount, created_by,
                status
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid,
                $4, $5, $6, $7, $8, $9, $10::uuid,
                CASE WHEN ABS($9 - $4) > 500 THEN 'PENDING' ELSE 'APPROVED' END
            )
            RETURNING id, status
        `, [
            sessionId, session.terminal_id, session.location_id,
            theoreticalAmount, session.opening_amount,
            session.cash_sales, session.movements_in, session.movements_out,
            declaredAmount, userId
        ]);

        const reconciliation = result.rows[0];

        // 3. Auditoría
        await auditLog(
            { userId, terminalId: session.terminal_id, sessionId },
            {
                action: 'RECONCILIATION',
                entityType: 'RECONCILIATION',
                entityId: reconciliation.id,
                newValues: { declared: declaredAmount, theoretical: theoreticalAmount, difference },
                justification: Math.abs(difference) > 500 
                    ? `Diferencia de $${difference} requiere justificación`
                    : 'Conciliación automática aprobada'
            }
        );

        return {
            success: true,
            reconciliationId: reconciliation.id,
            difference,
            requiresJustification: Math.abs(difference) > 500,
            status: reconciliation.status
        };

    } catch (error: any) {
        console.error('Reconciliation error:', error);
        return { success: false, error: error.message };
    }
}

export async function addJustification(input: {
    reconciliationId: string;
    type: string;
    description: string;
    amount: number;
    userId: string;
}) {
    if (input.description.length < 20) {
        return { success: false, error: 'La descripción debe tener al menos 20 caracteres' };
    }

    try {
        await query(`
            INSERT INTO reconciliation_justifications (
                reconciliation_id, justification_type, description,
                amount_justified, created_by
            ) VALUES ($1::uuid, $2, $3, $4, $5::uuid)
        `, [input.reconciliationId, input.type, input.description, input.amount, input.userId]);

        // Verificar si diferencia está cubierta
        const totals = await query(`
            SELECT cr.difference, COALESCE(SUM(rj.amount_justified), 0) as justified
            FROM cash_reconciliations cr
            LEFT JOIN reconciliation_justifications rj ON rj.reconciliation_id = cr.id
            WHERE cr.id = $1::uuid
            GROUP BY cr.id
        `, [input.reconciliationId]);

        if (totals.rows.length > 0) {
            const { difference, justified } = totals.rows[0];
            if (Number(justified) >= Math.abs(Number(difference)) * 0.9) {
                await query(`
                    UPDATE cash_reconciliations 
                    SET status = 'APPROVED', approved_at = NOW(), approval_notes = 'Auto-aprobado por justificación completa'
                    WHERE id = $1::uuid
                `, [input.reconciliationId]);
            }
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getPendingReconciliations(locationId?: string) {
    try {
        let sql = 'SELECT * FROM v_pending_reconciliations';
        const params: any[] = [];
        
        if (locationId) {
            sql += ' WHERE location_id = $1::uuid';
            params.push(locationId);
        }
        
        const result = await query(sql, params);
        return { success: true, data: result.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

---

# VERIFICACIÓN FINAL

```sql
-- 1. Verificar tablas de auditoría
SELECT COUNT(*) FROM audit_action_catalog; -- Debe ser > 10

-- 2. Verificar tablas de conciliación  
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE '%reconcil%';

-- 3. Test de auditoría (después de abrir/cerrar terminal)
SELECT action_code, entity_type, created_at 
FROM audit_log 
ORDER BY created_at DESC 
LIMIT 5;
```

---

# RESUMEN DE ARCHIVOS A CREAR/MODIFICAR

| Archivo | Acción |
|---------|--------|
| `src/db/migrations/005_audit_system.sql` | **CREAR** |
| `src/db/migrations/006_reconciliation_advanced.sql` | **CREAR** |
| `src/lib/audit.ts` | **CREAR** |
| `src/actions/reconciliation.ts` | **CREAR** |
| `src/actions/terminals-v2.ts` | **MODIFICAR** (agregar imports y llamadas a auditLog) |

---

**CONFIRMA cuando completes cada tarea para continuar.**
