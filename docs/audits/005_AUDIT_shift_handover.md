# AUDITORÍA #005: Módulo de Entrega de Turno (Shift Handover)
## Pharma-Synapse v3.1 - Análisis de Cambio de Turno

**Fecha**: 2024-12-23
**Archivo Auditado**: `src/actions/shift-handover.ts` (205 líneas)
**Criticidad**: 🟡 MEDIA-ALTA (Operación crítica de cierre)

---

## 1. RESUMEN EJECUTIVO

El módulo de handover gestiona el cierre de turno de un cajero, incluyendo el arqueo (conteo de caja) y la creación de remesas a tesorería. Se identificaron **2 problemas CRÍTICOS**, **3 MEDIOS** y **2 BAJOS**.

### Evaluación General

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Transacciones | 🟢 BIEN | `executeHandover` usa BEGIN/COMMIT/ROLLBACK |
| Bloqueo Pesimista | 🟢 PARCIAL | Usa FOR UPDATE en terminal, falta NOWAIT |
| Auditoría | 🔴 FALTA | Sin integración con audit_log |
| Validación | 🟡 PARCIAL | Sin validación de montos negativos |
| Concurrencia | 🟡 PARCIAL | `calculateHandover` sin bloqueo |

---

## 2. HALLAZGOS POSITIVOS ✅

### 2.1 Transacción Implementada en executeHandover

```typescript
// Líneas 131-204
const client = await import('@/lib/db').then(mod => mod.pool.connect());
try {
    await client.query('BEGIN');
    
    // FOR UPDATE en terminal
    const termRes = await client.query(
        "SELECT * FROM terminals WHERE id = $1::uuid FOR UPDATE", 
        [terminalId]
    );
    
    // ... operaciones ...
    
    await client.query('COMMIT');
} catch (error) {
    await client.query('ROLLBACK');
    // ...
} finally {
    client.release();
}
```

### 2.2 Lógica de Negocio Clara

El cálculo de handover sigue una fórmula clara:
```
expectedCash = opening_amount + cash_sales + cash_in - cash_out
diff = declaredCash - expectedCash
amountToWithdraw = declaredCash > BASE_CASH ? declaredCash - BASE_CASH : 0
```

### 2.3 Notificación a Managers

```typescript
// Líneas 185-191
await notifyManagers(
    terminal.location_id,
    "💰 Nueva Remesa Pendiente",
    `El cajero ${userId} ha cerrado turno...`,
    "/finance/treasury"
);
```

---

## 3. HALLAZGOS CRÍTICOS

### 3.1 CRÍTICO: calculateHandover Sin Bloqueo (Race Condition)

**Archivo**: `shift-handover.ts:25-123`

```typescript
export async function calculateHandover(
    terminalId: string,
    declaredCash: number
): Promise<...> {
    // ❌ Múltiples queries sin transacción ni bloqueo
    const sessionRes = await query(`...`, [terminalId]);
    const salesRes = await query(`...`, [terminalId]);
    const movementsRes = await query(`...`, [terminalId]);
    
    // Cálculo basado en datos que pueden cambiar entre queries
    expectedCash = expectedCash + cashSales + cashIn - cashOut;
}
```

**Riesgo**:
- Una venta puede registrarse entre `sessionRes` y `salesRes`
- El `expectedCash` calculado será incorrecto
- El `diff` mostrado al usuario no coincidirá con el real al ejecutar

**Escenario**:
1. Usuario abre modal de arqueo
2. `calculateHandover` calcula expectedCash = $500,000
3. Otra venta de $10,000 se registra (sistema sigue operando)
4. Usuario confirma con declaredCash = $510,000
5. `executeHandover` cierra con diff = $0 aparente
6. Realidad: sistema esperaba $510,000, hay inconsistencia

**Corrección**:
```typescript
export async function calculateHandoverAtomic(
    terminalId: string,
    declaredCash: number,
    lockSession: boolean = false // Para modo "preview" vs "execute"
): Promise<...> {
    const pool = (await import('@/lib/db')).pool;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        
        // Bloquear sesión si es ejecución
        const lockClause = lockSession ? 'FOR UPDATE NOWAIT' : 'FOR SHARE';
        
        const sessionRes = await client.query(`
            SELECT id, opening_amount, opened_at
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL 
            ORDER BY opened_at DESC LIMIT 1
            ${lockClause}
        `, [terminalId]);
        
        if (sessionRes.rowCount === 0) {
            throw new Error('NO_ACTIVE_SESSION');
        }
        
        const session = sessionRes.rows[0];
        
        // Queries dentro de la misma transacción = snapshot consistente
        const salesRes = await client.query(`
            SELECT COALESCE(SUM(total), 0) as total
            FROM sales 
            WHERE terminal_id = $1::uuid 
            AND payment_method = 'CASH'
            AND timestamp >= $2
        `, [terminalId, session.opened_at]);
        
        // ... resto del cálculo ...
        
        await client.query('COMMIT');
        
        return { success: true, data: summary };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        // ...
    } finally {
        client.release();
    }
}
```

---

### 3.2 CRÍTICO: Sin Integración con audit_log

Ninguna operación registra en `audit_log`:

| Operación | Datos Sensibles | audit_log |
|-----------|-----------------|-----------|
| `calculateHandover` | Montos esperados | ❌ No |
| `executeHandover` | Cierre de sesión, remesa | ❌ No |

**Impacto**:
- Imposible rastrear quién cerró qué turno
- Sin registro de diferencias de caja
- Sin trazabilidad de remesas

**Corrección en executeHandover**:
```typescript
// Después del COMMIT, antes de notifyManagers
await client.query(`
    INSERT INTO audit_log (
        id, user_id, session_id, action_code, entity_type, entity_id,
        old_values, new_values, ip_address, created_at
    ) VALUES ($1, $2, $3, 'SESSION_CLOSE', 'CASH_REGISTER_SESSION', $4, $5, $6, 'server', NOW())
`, [
    uuidv4(),
    userId,
    currentShift.id,
    currentShift.id,
    JSON.stringify({ status: 'OPEN', opening_amount: currentShift.opening_amount }),
    JSON.stringify({
        status: 'CLOSED',
        closing_amount: summary.declaredCash,
        expected_cash: summary.expectedCash,
        difference: summary.diff,
        remittance_id: remittanceId,
        amount_withdrawn: summary.amountToWithdraw
    })
]);
```

---

## 4. HALLAZGOS MEDIOS

### 4.1 MEDIO: FOR UPDATE Sin NOWAIT

**Archivo**: `shift-handover.ts:136`

```typescript
const termRes = await client.query(
    "SELECT * FROM terminals WHERE id = $1::uuid FOR UPDATE", 
    [terminalId]
);
```

Sin `NOWAIT`, la query esperará indefinidamente si otro proceso tiene el bloqueo.

**Corrección**:
```typescript
const termRes = await client.query(
    "SELECT * FROM terminals WHERE id = $1::uuid FOR UPDATE NOWAIT", 
    [terminalId]
);

// En catch block:
if (error.code === '55P03') {
    return { success: false, error: 'Terminal bloqueada por otra operación' };
}
```

---

### 4.2 MEDIO: Sin Validación de Inputs

**Archivo**: `shift-handover.ts:25-28`

```typescript
export async function calculateHandover(
    terminalId: string,    // ❌ Sin validación UUID
    declaredCash: number   // ❌ Sin validación > 0
): Promise<...> {
```

**Corrección con Zod**:
```typescript
import { z } from 'zod';

const HandoverSchema = z.object({
    terminalId: z.string().uuid(),
    declaredCash: z.number()
        .nonnegative('Declared cash cannot be negative')
        .max(100000000, 'Amount exceeds maximum')
});

export async function calculateHandover(input: z.infer<typeof HandoverSchema>) {
    const validated = HandoverSchema.parse(input);
    // ...
}
```

---

### 4.3 MEDIO: Query Subóptima con Subquery Repetida

**Archivo**: `shift-handover.ts:68-81`

```typescript
const movementsRes = await query(`
    SELECT ...
    FROM cash_movements
    WHERE 
        shift_id = (
            SELECT id FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL 
            ORDER BY opened_at DESC LIMIT 1
        )
        ...
`, [terminalId]);
```

La misma subquery se ejecuta 3 veces (líneas 32-37, 52-56, 74-78).

**Optimización**: Usar CTE o ejecutar subquery una vez:
```typescript
// Ya tenemos session.id de la primera query
const movementsRes = await query(`
    SELECT ...
    FROM cash_movements
    WHERE shift_id = $1::uuid AND is_cash = true
`, [session.id]);  // Usar ID obtenido antes
```

---

## 5. HALLAZGOS BAJOS

### 5.1 BAJO: Magic Number BASE_CASH

**Archivo**: `shift-handover.ts:15`

```typescript
const BASE_CASH = 50000;  // ❌ Hardcodeado
```

Debería ser configurable por ubicación:
```typescript
// Obtener de configuración
const configRes = await query(`
    SELECT COALESCE(
        (SELECT value FROM location_config WHERE location_id = $1 AND key = 'base_cash'),
        '50000'
    )::numeric as base_cash
`, [terminal.location_id]);
const BASE_CASH = Number(configRes.rows[0].base_cash);
```

---

### 5.2 BAJO: Comentarios Desactualizados

**Archivo**: `shift-handover.ts:6-14`

```typescript
import { createRemittance } from './treasury'; // reusing closeShift or closeTerminal logic? 
// Actually, closeTerminal in terminals.ts was modified to use createRemittance.
// But we need a more specific flow here.
// I will import closeTerminal logic or rewrite a specific one for Handover...
```

Comentarios de desarrollo que deberían eliminarse en producción.

---

## 6. MATRIZ DE DEPENDENCIAS

```
shift-handover.ts
├── @/lib/db (query, pool)
├── uuid (v4)
├── next/cache (revalidatePath)
├── ./treasury (createRemittance - importado pero no usado)
├── ./notifications (notifyManagers)
└── Tablas:
    ├── terminals
    ├── cash_register_sessions
    ├── sales
    ├── cash_movements
    └── treasury_remittances
```

---

## 7. FLUJO DE DATOS

```
┌─────────────────┐
│ calculateHandover│ (Preview - Sin bloqueo)
├─────────────────┤
│ 1. Obtener sesión activa
│ 2. Sumar ventas en efectivo
│ 3. Sumar movimientos (in/out)
│ 4. Calcular: expected = opening + sales + in - out
│ 5. Calcular: diff = declared - expected
│ 6. Calcular: withdraw = declared - BASE_CASH
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ executeHandover │ (Commit - Con transacción)
├─────────────────┤
│ BEGIN TRANSACTION
│ 1. Bloquear terminal (FOR UPDATE)
│ 2. Obtener sesión activa
│ 3. Crear remesa en treasury_remittances
│ 4. Cerrar sesión (closed_at, status='CLOSED')
│ 5. Actualizar terminal (status='CLOSED')
│ COMMIT
│ 6. Notificar managers
│ 7. Revalidar paths
└─────────────────┘
```

---

## 8. RECOMENDACIONES DE CORRECCIÓN

### Prioridad CRÍTICA (Inmediata)
1. **Agregar transacción a calculateHandover** (REPEATABLE READ)
2. **Integrar audit_log** en executeHandover
3. **Agregar NOWAIT** al FOR UPDATE

### Prioridad ALTA (Esta semana)
4. Agregar validación Zod para inputs
5. Optimizar queries eliminando subqueries repetidas
6. Hacer BASE_CASH configurable

### Prioridad MEDIA (Próximo sprint)
7. Limpiar comentarios de desarrollo
8. Agregar tests unitarios
9. Documentar flujo de handover

---

## 9. CÓDIGO CORREGIDO PROPUESTO

```typescript
'use server';

import { pool, query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// Schema de validación
const HandoverInputSchema = z.object({
    terminalId: z.string().uuid(),
    declaredCash: z.number().nonnegative().max(100000000)
});

const ExecuteHandoverSchema = z.object({
    terminalId: z.string().uuid(),
    summary: z.object({
        expectedCash: z.number(),
        declaredCash: z.number(),
        diff: z.number(),
        amountToWithdraw: z.number(),
        amountToKeep: z.number()
    }),
    userId: z.string().uuid(),
    nextUserId: z.string().uuid().optional()
});

/**
 * Calcula el arqueo con snapshot consistente de datos
 */
export async function calculateHandoverAtomic(
    terminalId: string,
    declaredCash: number
): Promise<{ success: boolean; data?: HandoverSummary; error?: string }> {
    // Validación
    const validated = HandoverInputSchema.safeParse({ terminalId, declaredCash });
    if (!validated.success) {
        return { success: false, error: validated.error.message };
    }
    
    const client = await pool.connect();
    
    try {
        // REPEATABLE READ garantiza snapshot consistente
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        
        // 1. Obtener sesión activa (FOR SHARE para lectura consistente)
        const sessionRes = await client.query(`
            SELECT id, opening_amount, opened_at, location_id
            FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL 
            ORDER BY opened_at DESC LIMIT 1
            FOR SHARE
        `, [terminalId]);
        
        if (sessionRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'No active shift found' };
        }
        
        const session = sessionRes.rows[0];
        const openingAmount = Number(session.opening_amount || 0);
        
        // 2. Obtener BASE_CASH de configuración
        const configRes = await client.query(`
            SELECT COALESCE(
                (SELECT value::numeric FROM location_config 
                 WHERE location_id = $1 AND key = 'base_cash'),
                50000
            ) as base_cash
        `, [session.location_id]);
        const BASE_CASH = Number(configRes.rows[0]?.base_cash || 50000);
        
        // 3. Ventas en efectivo (usando session.opened_at)
        const salesRes = await client.query(`
            SELECT COALESCE(SUM(total), 0) as total
            FROM sales 
            WHERE terminal_id = $1::uuid 
            AND payment_method = 'CASH'
            AND timestamp >= $2
        `, [terminalId, session.opened_at]);
        
        const cashSales = Number(salesRes.rows[0]?.total || 0);
        
        // 4. Movimientos de caja (usando session.id directamente)
        const movementsRes = await client.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN type IN ('IN', 'EXTRA_INCOME') THEN amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN type IN ('OUT', 'WITHDRAWAL', 'EXPENSE') THEN amount ELSE 0 END), 0) as total_out
            FROM cash_movements
            WHERE session_id = $1::uuid
            AND is_cash = true
        `, [session.id]);
        
        const cashIn = Number(movementsRes.rows[0]?.total_in || 0);
        const cashOut = Number(movementsRes.rows[0]?.total_out || 0);
        
        await client.query('COMMIT');
        
        // 5. Cálculos
        const expectedCash = openingAmount + cashSales + cashIn - cashOut;
        const diff = declaredCash - expectedCash;
        
        let amountToKeep = BASE_CASH;
        let amountToWithdraw = 0;
        
        if (declaredCash > BASE_CASH) {
            amountToWithdraw = declaredCash - BASE_CASH;
            amountToKeep = BASE_CASH;
        } else {
            amountToKeep = declaredCash;
            amountToWithdraw = 0;
        }
        
        return {
            success: true,
            data: {
                expectedCash,
                declaredCash,
                diff,
                amountToWithdraw,
                amountToKeep
            }
        };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error calculating handover:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

/**
 * Ejecuta el cierre de turno con auditoría completa
 */
export async function executeHandoverAtomic(
    terminalId: string,
    summary: HandoverSummary,
    userId: string,
    nextUserId?: string
): Promise<{ success: boolean; error?: string }> {
    // Validación
    const validated = ExecuteHandoverSchema.safeParse({ 
        terminalId, summary, userId, nextUserId 
    });
    if (!validated.success) {
        return { success: false, error: validated.error.message };
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // 1. Bloquear terminal con NOWAIT
        const termRes = await client.query(`
            SELECT * FROM terminals WHERE id = $1::uuid FOR UPDATE NOWAIT
        `, [terminalId]);
        
        if (termRes.rowCount === 0) {
            throw new Error('TERMINAL_NOT_FOUND');
        }
        
        const terminal = termRes.rows[0];
        
        // 2. Obtener y bloquear sesión activa
        const shiftRes = await client.query(`
            SELECT * FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND closed_at IS NULL 
            ORDER BY opened_at DESC LIMIT 1
            FOR UPDATE NOWAIT
        `, [terminalId]);
        
        if (shiftRes.rowCount === 0) {
            throw new Error('NO_ACTIVE_SESSION');
        }
        
        const currentShift = shiftRes.rows[0];
        
        // 3. Crear remesa (si hay retiro)
        const remittanceId = uuidv4();
        if (summary.amountToWithdraw > 0) {
            await client.query(`
                INSERT INTO treasury_remittances (
                    id, location_id, source_terminal_id, amount, status, 
                    created_by, created_at, shift_start, shift_end, 
                    cash_count_diff, notes
                ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'PENDING_RECEIPT', 
                          $5::uuid, NOW(), $6, NOW(), $7, $8)
            `, [
                remittanceId,
                terminal.location_id,
                terminalId,
                summary.amountToWithdraw,
                userId,
                currentShift.opened_at,
                summary.diff,
                `Arqueo: Declarado $${summary.declaredCash} vs Sistema $${summary.expectedCash}`
            ]);
        }
        
        // 4. Cerrar sesión
        await client.query(`
            UPDATE cash_register_sessions 
            SET closed_at = NOW(), 
                status = 'CLOSED',
                closing_amount = $2,
                real_closing_amount = $2,
                expected_amount = $3
            WHERE id = $1::uuid
        `, [currentShift.id, summary.declaredCash, summary.expectedCash]);
        
        // 5. Actualizar terminal
        await client.query(`
            UPDATE terminals 
            SET current_cashier_id = NULL, status = 'CLOSED' 
            WHERE id = $1::uuid
        `, [terminalId]);
        
        // 6. AUDITORÍA - Registro completo
        await client.query(`
            INSERT INTO audit_log (
                id, user_id, session_id, action_code, entity_type, entity_id,
                old_values, new_values, ip_address, created_at
            ) VALUES ($1, $2, $3, 'SESSION_CLOSE', 'CASH_REGISTER_SESSION', $4, $5, $6, 'server', NOW())
        `, [
            uuidv4(),
            userId,
            currentShift.id,
            currentShift.id,
            JSON.stringify({ 
                status: 'OPEN', 
                opening_amount: currentShift.opening_amount 
            }),
            JSON.stringify({
                status: 'CLOSED',
                closing_amount: summary.declaredCash,
                expected_cash: summary.expectedCash,
                difference: summary.diff,
                remittance_id: summary.amountToWithdraw > 0 ? remittanceId : null,
                amount_withdrawn: summary.amountToWithdraw
            })
        ]);
        
        await client.query('COMMIT');
        
        // 7. Notificaciones (fuera de transacción)
        try {
            const { notifyManagers } = await import('./notifications');
            await notifyManagers(
                terminal.location_id,
                "💰 Nueva Remesa Pendiente",
                `Cajero ha cerrado turno. Monto: $${summary.amountToWithdraw.toLocaleString('es-CL')}`,
                "/finance/treasury"
            );
        } catch (notifyError) {
            console.error('Notification failed (non-critical):', notifyError);
        }
        
        revalidatePath('/pos');
        revalidatePath('/finance/treasury');
        
        return { success: true };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        
        if (error.code === '55P03') {
            return { success: false, error: 'Terminal/sesión bloqueada por otra operación' };
        }
        if (error.message === 'TERMINAL_NOT_FOUND') {
            return { success: false, error: 'Terminal no encontrada' };
        }
        if (error.message === 'NO_ACTIVE_SESSION') {
            return { success: false, error: 'No hay sesión activa para cerrar' };
        }
        
        console.error('Handover Error:', error);
        return { success: false, error: error.message };
        
    } finally {
        client.release();
    }
}
```

---

## 10. CHECKLIST DE CORRECCIÓN

- [ ] Agregar transacción REPEATABLE READ a `calculateHandover`
- [ ] Agregar FOR UPDATE NOWAIT a sesión en `executeHandover`
- [ ] Integrar audit_log en `executeHandover`
- [ ] Agregar validación Zod
- [ ] Hacer BASE_CASH configurable
- [ ] Optimizar queries (eliminar subqueries repetidas)
- [ ] Agregar manejo de error 55P03
- [ ] Limpiar comentarios de desarrollo
- [ ] Tests unitarios

---

**Próximo archivo a auditar**: `reconciliation.ts`
