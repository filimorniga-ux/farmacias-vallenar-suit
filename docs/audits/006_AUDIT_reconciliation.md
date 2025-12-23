# AUDITORÍA #006: Módulo de Conciliación (Reconciliation)
## Pharma-Synapse v3.1 - Análisis de Control Fiscal

**Fecha**: 2024-12-23
**Archivo Auditado**: `src/actions/reconciliation.ts` (81 líneas)
**Criticidad**: 🔴 ALTA (Control fiscal/auditoría)

---

## 1. RESUMEN EJECUTIVO

El módulo de conciliación permite a gerentes ajustar montos de cierre de sesiones para corregir diferencias. Es una operación **altamente sensible** desde perspectiva de auditoría fiscal. Se identificaron **2 problemas CRÍTICOS**, **3 MEDIOS** y **1 BAJO**.

### Evaluación General

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Validación | 🟢 BIEN | Usa Zod para validación |
| Transacciones | 🔴 FALTA | Sin BEGIN/COMMIT |
| Auditoría | 🟡 PARCIAL | Try-catch silencia errores |
| Bloqueo | 🔴 FALTA | Sin FOR UPDATE |
| Permisos | 🔴 FALTA | Sin verificación de rol |

---

## 2. HALLAZGOS POSITIVOS ✅

### 2.1 Validación con Zod Implementada

```typescript
// Líneas 7-12
const ReconciliationSchema = z.object({
    sessionId: z.string().uuid(),
    realClosingAmount: z.number().min(0),
    managerNotes: z.string().min(5, "Debe justificar la conciliación"),
    managerId: z.string().uuid()
});
```

**Fortalezas**:
- Valida UUIDs
- Requiere justificación mínima de 5 caracteres
- Previene montos negativos

### 2.2 Cálculo de Métricas Completo

```typescript
// Líneas 23-31
const metricsResult = await query(`
    SELECT 
        s.opening_amount,
        COALESCE((SELECT SUM(total) FROM sales WHERE shift_id = s.id AND payment_method = 'CASH'), 0) as cash_sales,
        COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = s.id AND type = 'EXPENSE'), 0) as expenses,
        COALESCE((SELECT SUM(amount) FROM cash_movements WHERE session_id = s.id AND type = 'WITHDRAWAL'), 0) as withdrawals
    FROM cash_register_sessions s
    WHERE s.id = $1
`, [sessionId]);
```

Formula correcta: `expected = opening + sales - expenses - withdrawals`

---

## 3. HALLAZGOS CRÍTICOS

### 3.1 CRÍTICO: Sin Transacción Atómica

**Archivo**: `reconciliation.ts:20-70`

```typescript
try {
    // Query 1: Obtener métricas
    const metricsResult = await query(`...`);
    
    // Query 2: Actualizar sesión
    await query(`UPDATE cash_register_sessions SET ...`);
    
    // Query 3: Insertar audit_log
    try {
        await query(`INSERT INTO audit_log ...`);
    } catch (e) {
        console.warn('Audit log table missing or error', e);  // ❌ SILENCIADO
    }
}
```

**Problemas**:
1. **Sin BEGIN/COMMIT**: Las operaciones no son atómicas
2. **Race condition**: Métricas pueden cambiar entre queries
3. **Auditoría silenciada**: Si falla el audit_log, la conciliación igual se ejecuta

**Riesgo fiscal GRAVE**:
- Un gerente podría conciliar una sesión
- El audit_log falla (tabla no existe, FK inválida, etc.)
- La conciliación queda sin registro auditable
- **Imposible rastrear quién modificó los números**

**Corrección**:
```typescript
export async function reconcileSessionAtomic(
    data: z.infer<typeof ReconciliationSchema>
): Promise<{ success: boolean; difference?: number; error?: string }> {
    const validated = ReconciliationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.message };
    }

    const { sessionId, realClosingAmount, managerNotes, managerId } = validated.data;
    
    const pool = (await import('@/lib/db')).pool;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // 1. Bloquear sesión
        const sessionRes = await client.query(`
            SELECT id, status, closing_amount, reconciled_by
            FROM cash_register_sessions 
            WHERE id = $1 
            FOR UPDATE NOWAIT
        `, [sessionId]);
        
        if (sessionRes.rowCount === 0) {
            throw new Error('SESSION_NOT_FOUND');
        }
        
        const session = sessionRes.rows[0];
        
        // Validar que no esté ya conciliada
        if (session.reconciled_by) {
            throw new Error('ALREADY_RECONCILED');
        }
        
        // 2. Calcular métricas (dentro de transacción)
        const metricsRes = await client.query(`
            SELECT 
                s.opening_amount,
                COALESCE((SELECT SUM(total) FROM sales 
                          WHERE terminal_id = s.terminal_id 
                          AND timestamp >= s.opened_at 
                          AND timestamp <= COALESCE(s.closed_at, NOW())
                          AND payment_method = 'CASH'), 0) as cash_sales,
                COALESCE((SELECT SUM(amount) FROM cash_movements 
                          WHERE session_id = s.id AND type = 'EXPENSE'), 0) as expenses,
                COALESCE((SELECT SUM(amount) FROM cash_movements 
                          WHERE session_id = s.id AND type = 'WITHDRAWAL'), 0) as withdrawals
            FROM cash_register_sessions s
            WHERE s.id = $1
        `, [sessionId]);
        
        const m = metricsRes.rows[0];
        const expectedAmount = Number(m.opening_amount) + Number(m.cash_sales) 
                             - Number(m.expenses) - Number(m.withdrawals);
        const difference = realClosingAmount - expectedAmount;
        
        // Guardar valores originales para auditoría
        const oldValues = {
            closing_amount: session.closing_amount,
            status: session.status
        };
        
        // 3. Actualizar sesión
        await client.query(`
            UPDATE cash_register_sessions
            SET 
                closing_amount = $1,
                real_closing_amount = $1,
                expected_amount = $2,
                difference = $3,
                status = 'RECONCILED',
                notes = COALESCE(notes, '') || ' | [CONCILIADO ' || NOW()::date || ']: ' || $4,
                reconciled_at = NOW(),
                reconciled_by = $5
            WHERE id = $6
        `, [realClosingAmount, expectedAmount, difference, managerNotes, managerId, sessionId]);
        
        // 4. AUDITORÍA OBLIGATORIA (dentro de transacción)
        await client.query(`
            INSERT INTO audit_log (
                id, user_id, session_id, action_code, entity_type, entity_id,
                old_values, new_values, justification, ip_address, created_at
            ) VALUES (
                gen_random_uuid(), $1, $2, 'RECONCILIATION', 'CASH_REGISTER_SESSION', $2,
                $3, $4, $5, 'server', NOW()
            )
        `, [
            managerId,
            sessionId,
            JSON.stringify(oldValues),
            JSON.stringify({
                closing_amount: realClosingAmount,
                expected_amount: expectedAmount,
                difference: difference,
                status: 'RECONCILED'
            }),
            managerNotes
        ]);
        
        await client.query('COMMIT');
        
        revalidatePath('/reports');
        revalidatePath('/dashboard');
        
        return { success: true, difference };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        
        if (error.code === '55P03') {
            return { success: false, error: 'Sesión bloqueada por otra operación' };
        }
        if (error.message === 'SESSION_NOT_FOUND') {
            return { success: false, error: 'Sesión no encontrada' };
        }
        if (error.message === 'ALREADY_RECONCILED') {
            return { success: false, error: 'Esta sesión ya fue conciliada anteriormente' };
        }
        
        console.error('Error conciliando:', error);
        return { success: false, error: 'Error interno al conciliar' };
        
    } finally {
        client.release();
    }
}
```

---

### 3.2 CRÍTICO: Sin Verificación de Permisos

**Archivo**: `reconciliation.ts:14-16`

```typescript
export async function reconcileSession(data: z.infer<typeof ReconciliationSchema>) {
    // ❌ NO VERIFICA:
    // - ¿El managerId tiene rol de gerente?
    // - ¿El manager pertenece a la ubicación de la sesión?
    // - ¿El manager tiene permiso RECONCILE?
    
    const { managerId } = validated.data;
    // Cualquier UUID válido puede conciliar
}
```

**Riesgo**:
- Un cajero podría conciliar sus propias sesiones
- Sin segregación de funciones
- Incumplimiento de controles internos

**Corrección**:
```typescript
// Agregar verificación de permisos
const managerCheck = await client.query(`
    SELECT u.id, u.role, u.location_id
    FROM users u
    WHERE u.id = $1
`, [managerId]);

if (managerCheck.rowCount === 0) {
    throw new Error('MANAGER_NOT_FOUND');
}

const manager = managerCheck.rows[0];
const allowedRoles = ['MANAGER', 'ADMIN', 'QF', 'GERENTE_GENERAL'];

if (!allowedRoles.includes(manager.role)) {
    throw new Error('UNAUTHORIZED_ROLE');
}

// Verificar que el manager pertenezca a la misma ubicación
if (manager.location_id !== session.location_id && manager.role !== 'ADMIN') {
    throw new Error('UNAUTHORIZED_LOCATION');
}
```

---

## 4. HALLAZGOS MEDIOS

### 4.1 MEDIO: Audit Log Silenciado

**Archivo**: `reconciliation.ts:59-70`

```typescript
try {
    await query(`
        INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, timestamp)
        VALUES (gen_random_uuid(), $1, 'RECONCILE_SESSION', 'SESSION', $2, $3, NOW())
    `, [managerId, sessionId, JSON.stringify({...})]);
} catch (e) {
    console.warn('Audit log table missing or error', e);  // ❌ WARNING Y CONTINÚA
}
```

**Problema**: La conciliación se completa aunque falle la auditoría.

**Para operaciones fiscales, la auditoría debe ser OBLIGATORIA**.

---

### 4.2 MEDIO: Schema de audit_log Inconsistente

```typescript
// Código actual usa:
INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, timestamp)

// Pero migración 005 define:
INSERT INTO audit_log (id, user_id, session_id, action_code, entity_type, entity_id, 
                       old_values, new_values, justification, ip_address, created_at)
```

**Incompatibilidad de schema** - el código no usa la estructura correcta de la tabla.

---

### 4.3 MEDIO: Query de Sales Usa `shift_id` Incorrecto

**Archivo**: `reconciliation.ts:26`

```typescript
COALESCE((SELECT SUM(total) FROM sales WHERE shift_id = s.id ...), 0) as cash_sales
```

**Problema**: La tabla `sales` probablemente no tiene columna `shift_id`, debería ser:
```sql
WHERE terminal_id = s.terminal_id 
AND timestamp >= s.opened_at 
AND timestamp <= COALESCE(s.closed_at, NOW())
```

---

## 5. HALLAZGOS BAJOS

### 5.1 BAJO: Justificación Mínima Insuficiente

```typescript
managerNotes: z.string().min(5, "Debe justificar la conciliación")
```

5 caracteres es insuficiente para una justificación fiscal. Debería ser mínimo 20-50.

---

## 6. MATRIZ DE DEPENDENCIAS

```
reconciliation.ts
├── @/lib/db (query)
├── next/cache (revalidatePath)
├── zod
└── Tablas:
    ├── cash_register_sessions
    ├── sales
    ├── cash_movements
    └── audit_log
```

---

## 7. ANÁLISIS DE IMPACTO FISCAL

La conciliación es una operación **crítica para auditoría fiscal** porque:

1. **Modifica registros históricos**: Cambia `closing_amount` de sesiones cerradas
2. **Afecta trazabilidad**: Sin auditoría, imposible reconstruir historia
3. **Segregación de funciones**: Debe requerir rol gerencial
4. **Inmutabilidad**: Una vez conciliada, no debería poder re-conciliarse

### Requisitos de Cumplimiento Fiscal (Chile)

| Requisito | Estado Actual | Requerido |
|-----------|---------------|-----------|
| Registro de quién modificó | 🟡 Parcial | ✅ Obligatorio |
| Registro de cuándo | 🟢 Sí | ✅ Obligatorio |
| Registro de valores anteriores | 🔴 No | ✅ Obligatorio |
| Justificación obligatoria | 🟢 Sí (5 chars) | ✅ Mínimo 20 chars |
| Prevenir doble conciliación | 🔴 No | ✅ Obligatorio |
| Verificación de rol | 🔴 No | ✅ Obligatorio |

---

## 8. RECOMENDACIONES DE CORRECCIÓN

### Prioridad CRÍTICA (Inmediata)
1. **Envolver en transacción atómica** (SERIALIZABLE)
2. **Hacer audit_log obligatorio** (no try-catch silencioso)
3. **Agregar verificación de permisos**
4. **Prevenir doble conciliación**

### Prioridad ALTA (Esta semana)
5. Corregir query de sales (shift_id → timestamp range)
6. Actualizar schema de audit_log
7. Aumentar mínimo de justificación a 20 caracteres

### Prioridad MEDIA (Próximo sprint)
8. Agregar FOR UPDATE NOWAIT
9. Tests unitarios
10. Documentar proceso de conciliación

---

## 9. ESTADO DE MIGRACIÓN 006

La migración `006_reconciliation_module.sql` define:

```sql
CREATE TABLE IF NOT EXISTS cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES cash_register_sessions(id),
    theoretical_amount NUMERIC(15,2) NOT NULL,
    declared_amount NUMERIC(15,2) NOT NULL,
    difference NUMERIC(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    reconciled_by UUID REFERENCES users(id),
    reconciled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**RECOMENDACIÓN**: Usar esta tabla en lugar de modificar `cash_register_sessions` directamente. Esto permite:
- Historial completo de conciliaciones
- Múltiples intentos de conciliación
- Mejor auditoría

---

## 10. CÓDIGO CORREGIDO PROPUESTO

```typescript
'use server';

import { pool } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Schema mejorado
const ReconciliationSchema = z.object({
    sessionId: z.string().uuid(),
    realClosingAmount: z.number().nonnegative(),
    managerNotes: z.string()
        .min(20, "La justificación debe tener al menos 20 caracteres")
        .max(500, "La justificación no puede exceder 500 caracteres"),
    managerId: z.string().uuid()
});

// Roles autorizados para conciliar
const RECONCILIATION_ROLES = ['MANAGER', 'ADMIN', 'QF', 'GERENTE_GENERAL'];

export async function reconcileSessionAtomic(
    data: z.infer<typeof ReconciliationSchema>
): Promise<{ success: boolean; difference?: number; reconciliationId?: string; error?: string }> {
    const validated = ReconciliationSchema.safeParse(data);
    if (!validated.success) {
        return { success: false, error: validated.error.errors[0]?.message || 'Datos inválidos' };
    }

    const { sessionId, realClosingAmount, managerNotes, managerId } = validated.data;
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // 1. Verificar permisos del manager
        const managerRes = await client.query(`
            SELECT id, role, location_id FROM users WHERE id = $1
        `, [managerId]);
        
        if (managerRes.rowCount === 0) {
            throw new Error('MANAGER_NOT_FOUND');
        }
        
        const manager = managerRes.rows[0];
        
        if (!RECONCILIATION_ROLES.includes(manager.role)) {
            throw new Error('UNAUTHORIZED_ROLE');
        }
        
        // 2. Bloquear sesión
        const sessionRes = await client.query(`
            SELECT s.*, l.id as location_id
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            JOIN locations l ON t.location_id = l.id
            WHERE s.id = $1 
            FOR UPDATE NOWAIT
        `, [sessionId]);
        
        if (sessionRes.rowCount === 0) {
            throw new Error('SESSION_NOT_FOUND');
        }
        
        const session = sessionRes.rows[0];
        
        // Verificar ubicación (solo ADMIN puede conciliar otras ubicaciones)
        if (manager.location_id !== session.location_id && manager.role !== 'ADMIN') {
            throw new Error('UNAUTHORIZED_LOCATION');
        }
        
        // 3. Verificar si ya existe conciliación
        const existingRecon = await client.query(`
            SELECT id FROM cash_reconciliations 
            WHERE session_id = $1 AND status = 'APPROVED'
        `, [sessionId]);
        
        if (existingRecon.rowCount > 0) {
            throw new Error('ALREADY_RECONCILED');
        }
        
        // 4. Calcular métricas
        const metricsRes = await client.query(`
            SELECT 
                s.opening_amount,
                COALESCE(
                    (SELECT SUM(total) FROM sales 
                     WHERE terminal_id = s.terminal_id 
                     AND timestamp >= s.opened_at 
                     AND (s.closed_at IS NULL OR timestamp <= s.closed_at)
                     AND payment_method = 'CASH'), 0
                ) as cash_sales,
                COALESCE(
                    (SELECT SUM(amount) FROM cash_movements 
                     WHERE session_id = s.id AND type IN ('EXPENSE', 'OUT')), 0
                ) as total_out,
                COALESCE(
                    (SELECT SUM(amount) FROM cash_movements 
                     WHERE session_id = s.id AND type IN ('EXTRA_INCOME', 'IN')), 0
                ) as total_in
            FROM cash_register_sessions s
            WHERE s.id = $1
        `, [sessionId]);
        
        const m = metricsRes.rows[0];
        const theoreticalAmount = Number(m.opening_amount) + Number(m.cash_sales) 
                                + Number(m.total_in) - Number(m.total_out);
        const difference = realClosingAmount - theoreticalAmount;
        
        // 5. Crear registro de conciliación
        const reconciliationId = uuidv4();
        await client.query(`
            INSERT INTO cash_reconciliations (
                id, session_id, theoretical_amount, declared_amount, 
                difference, status, reconciled_by, reconciled_at, notes
            ) VALUES ($1, $2, $3, $4, $5, 'APPROVED', $6, NOW(), $7)
        `, [
            reconciliationId,
            sessionId,
            theoreticalAmount,
            realClosingAmount,
            difference,
            managerId,
            managerNotes
        ]);
        
        // 6. Actualizar sesión
        await client.query(`
            UPDATE cash_register_sessions
            SET 
                real_closing_amount = $1,
                expected_amount = $2,
                difference = $3,
                reconciled_at = NOW(),
                reconciled_by = $4
            WHERE id = $5
        `, [realClosingAmount, theoreticalAmount, difference, managerId, sessionId]);
        
        // 7. AUDITORÍA OBLIGATORIA
        await client.query(`
            INSERT INTO audit_log (
                id, user_id, session_id, action_code, entity_type, entity_id,
                old_values, new_values, justification, ip_address, created_at
            ) VALUES (
                gen_random_uuid(), $1, $2, 'RECONCILIATION', 'CASH_REGISTER_SESSION', $2,
                $3, $4, $5, 'server', NOW()
            )
        `, [
            managerId,
            sessionId,
            JSON.stringify({
                closing_amount: session.closing_amount,
                expected: theoreticalAmount
            }),
            JSON.stringify({
                closing_amount: realClosingAmount,
                expected: theoreticalAmount,
                difference: difference,
                reconciliation_id: reconciliationId
            }),
            managerNotes
        ]);
        
        await client.query('COMMIT');
        
        revalidatePath('/reports');
        revalidatePath('/dashboard');
        
        return { 
            success: true, 
            difference,
            reconciliationId 
        };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        
        const errorMessages: Record<string, string> = {
            '55P03': 'Sesión bloqueada por otra operación',
            'SESSION_NOT_FOUND': 'Sesión no encontrada',
            'MANAGER_NOT_FOUND': 'Usuario gerente no encontrado',
            'UNAUTHORIZED_ROLE': 'No tiene permisos para conciliar',
            'UNAUTHORIZED_LOCATION': 'No puede conciliar sesiones de otra ubicación',
            'ALREADY_RECONCILED': 'Esta sesión ya fue conciliada'
        };
        
        const message = errorMessages[error.code] || errorMessages[error.message] 
                      || 'Error interno al conciliar';
        
        console.error('Error conciliando:', error);
        return { success: false, error: message };
        
    } finally {
        client.release();
    }
}
```

---

## 11. CHECKLIST DE CORRECCIÓN

- [ ] Envolver en transacción SERIALIZABLE
- [ ] Agregar FOR UPDATE NOWAIT
- [ ] Verificar permisos de manager
- [ ] Verificar ubicación del manager
- [ ] Prevenir doble conciliación
- [ ] Hacer audit_log obligatorio (no silenciar)
- [ ] Corregir schema de audit_log
- [ ] Corregir query de sales (shift_id → timestamp)
- [ ] Aumentar mínimo de justificación
- [ ] Usar tabla `cash_reconciliations`
- [ ] Tests unitarios

---

**Próximo archivo a auditar**: `security.ts` y `auth.ts`
