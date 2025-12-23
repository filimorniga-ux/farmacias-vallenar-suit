# Prompt de Implementación para Agentes Antigravity
## Pharma-Synapse v3.1 - Farmacias Vallenar

**Fecha:** 2025-12-23  
**Prioridad:** CRÍTICA  
**Tiempo estimado total:** 8-12 horas de trabajo de agente

---

## CONTEXTO PARA EL AGENTE

Eres un agente de desarrollo trabajando en **Pharma-Synapse v3.1**, un ERP farmacéutico para Farmacias Vallenar (Chile). El sistema maneja:

- Control fiscal y financiero (arqueos, ventas, DTE/SII)
- Sesiones de caja en terminales POS
- Auditoría para cumplimiento fiscal chileno

**Stack técnico:**
- Next.js 14+ con Server Actions
- React 18 + Zustand + React Query
- PostgreSQL (producción)
- TypeScript estricto

**Documentación de referencia obligatoria:**
- `docs/ARQUITECTURA_AUDIT_FINANCIERO_v3.1.md` - Análisis completo de arquitectura
- `src/db/migrations/004_uuid_standardization.sql` - Migración de UUIDs
- `src/db/migrations/005_audit_system.sql` - Sistema de auditoría
- `src/db/migrations/006_reconciliation_module.sql` - Módulo de conciliación
- `src/lib/audit-v2.ts` - API de auditoría TypeScript

---

## TAREA 1: Refactorizar openTerminal() con Bloqueo Pesimista

### Archivo a modificar
`src/actions/terminals.ts`

### Problema actual
La función `openTerminal()` tiene una race condition entre el SELECT y el UPDATE que permite que dos cajeros abran el mismo terminal simultáneamente.

### Código actual (líneas ~57-153):
```typescript
// PROBLEMA: Ventana de tiempo entre CHECK y UPDATE
const termRes = await query('SELECT * FROM terminals WHERE id = $1', [terminalId]);
// ... validaciones ...
// AQUÍ OTRO PROCESO PUEDE ABRIR EL MISMO TERMINAL
await query(`UPDATE terminals SET status = 'OPEN'...`);
```

### Solución requerida
Implementar bloqueo pesimista con transacción y `FOR UPDATE NOWAIT`:

```typescript
export async function openTerminal(terminalId: string, userId: string, initialCash: number) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. BLOQUEO PESIMISTA - Nadie más puede tocar este terminal
        const termRes = await client.query(
            'SELECT * FROM terminals WHERE id = $1 FOR UPDATE NOWAIT',
            [terminalId]
        );
        
        if (termRes.rows.length === 0) {
            throw new Error('Terminal no encontrado');
        }
        
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
            // Auto-cerrar sesiones zombie del usuario
            await client.query(`
                UPDATE cash_register_sessions
                SET status = 'CLOSED_AUTO', 
                    closed_at = NOW(),
                    notes = 'Auto-cerrado por nueva apertura'
                WHERE user_id = $1 AND status = 'OPEN'
            `, [userId]);
        }
        
        // 3. Crear movimiento de apertura
        const { v4: uuidv4 } = await import('uuid');
        const movementId = uuidv4();
        
        await client.query(`
            INSERT INTO cash_movements (id, terminal_id, user_id, type, amount, reason, timestamp)
            VALUES ($1, $2::uuid, $3::uuid, 'OPENING', $4, 'Apertura de Caja', NOW())
        `, [movementId, terminalId, userId, initialCash]);
        
        // 4. Crear sesión
        const sessionId = uuidv4();
        await client.query(`
            INSERT INTO cash_register_sessions (
                id, terminal_id, user_id, opening_amount, status, opened_at
            ) VALUES ($1, $2::uuid, $3::uuid, $4, 'OPEN', NOW())
        `, [sessionId, terminalId, userId, initialCash]);
        
        // 5. Actualizar terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'OPEN', current_cashier_id = $2
            WHERE id = $1::uuid
        `, [terminalId, userId]);
        
        // 6. Registrar auditoría
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, action_code, entity_type, entity_id,
                new_values
            ) VALUES (
                $1::uuid, $2::uuid, 'SESSION_OPEN', 'SESSION', $3,
                $4::jsonb
            )
        `, [
            userId, 
            terminalId, 
            sessionId,
            JSON.stringify({ opening_amount: initialCash })
        ]);
        
        await client.query('COMMIT');
        
        return {
            success: true,
            data: {
                id: sessionId,
                terminal_id: terminalId,
                user_id: userId,
                start_time: Date.now(),
                opening_amount: initialCash,
                status: 'ACTIVE'
            }
        };
        
    } catch (e: any) {
        await client.query('ROLLBACK');
        
        // Error específico de lock no disponible
        if (e.code === '55P03') {
            return { success: false, error: 'Terminal ocupado por otro proceso. Intente nuevamente.' };
        }
        
        if (e.message === 'TERMINAL_ALREADY_OPEN') {
            return { success: false, error: 'El terminal ya está abierto por otro cajero.' };
        }
        
        console.error('Error in openTerminal:', e);
        return { success: false, error: e.message || 'Error al abrir terminal' };
    } finally {
        client.release();
    }
}
```

### Validación
Después de implementar, verificar que:
1. No se puede abrir el mismo terminal dos veces simultáneamente
2. Las sesiones zombie del usuario se cierran automáticamente
3. Se registra en audit_log con action_code 'SESSION_OPEN'

---

## TAREA 2: Refactorizar closeTerminal() con Auditoría

### Archivo a modificar
`src/actions/terminals.ts`

### Implementación requerida
Agregar auditoría y transacción atómica:

```typescript
export async function closeTerminal(
    terminalId: string, 
    userId: string, 
    finalCash: number, 
    comments: string, 
    withdrawalAmount?: number
) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Bloquear terminal
        const termRes = await client.query(
            'SELECT * FROM terminals WHERE id = $1::uuid FOR UPDATE',
            [terminalId]
        );
        
        if (termRes.rows.length === 0) {
            throw new Error('Terminal no encontrado');
        }
        
        // 2. Obtener sesión activa
        const sessionRes = await client.query(`
            SELECT * FROM cash_register_sessions 
            WHERE terminal_id = $1::uuid AND status = 'OPEN'
            FOR UPDATE
        `, [terminalId]);
        
        if (sessionRes.rowCount === 0) {
            throw new Error('No hay sesión activa para cerrar');
        }
        
        const session = sessionRes.rows[0];
        const { v4: uuidv4 } = await import('uuid');
        
        // 3. Registrar movimiento de cierre
        await client.query(`
            INSERT INTO cash_movements (id, terminal_id, session_id, user_id, type, amount, reason, timestamp)
            VALUES ($1, $2::uuid, $3::uuid, $4::uuid, 'CLOSING', $5, $6, NOW())
        `, [uuidv4(), terminalId, session.id, userId, finalCash, `Cierre: ${comments}`]);
        
        // 4. Cerrar sesión
        await client.query(`
            UPDATE cash_register_sessions
            SET status = 'CLOSED',
                closed_at = NOW(),
                closing_amount = $2,
                notes = $3
            WHERE id = $1
        `, [session.id, finalCash, comments]);
        
        // 5. Cerrar terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'CLOSED', current_cashier_id = NULL
            WHERE id = $1::uuid
        `, [terminalId]);
        
        // 6. Crear remesa si hay retiro
        if (withdrawalAmount && withdrawalAmount > 0) {
            const terminal = termRes.rows[0];
            await client.query(`
                INSERT INTO treasury_remittances (
                    id, location_id, source_terminal_id, amount, 
                    status, created_by, created_at
                ) VALUES ($1, $2::uuid, $3::uuid, $4, 'PENDING_RECEIPT', $5::uuid, NOW())
            `, [uuidv4(), terminal.location_id, terminalId, withdrawalAmount, userId]);
        }
        
        // 7. Auditoría
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, session_id, action_code, 
                entity_type, entity_id, new_values
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, 'SESSION_CLOSE',
                'SESSION', $3, $4::jsonb
            )
        `, [
            userId, 
            terminalId, 
            session.id,
            JSON.stringify({ 
                closing_amount: finalCash, 
                withdrawal: withdrawalAmount || 0,
                comments 
            })
        ]);
        
        await client.query('COMMIT');
        return { success: true };
        
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Error closing terminal:', e);
        return { success: false, error: e.message || 'Error al cerrar terminal' };
    } finally {
        client.release();
    }
}
```

---

## TAREA 3: Actualizar createSale() para usar Auditoría

### Archivo a modificar
`src/actions/sales.ts`

### Cambio requerido
Agregar registro de auditoría al final de la transacción exitosa:

```typescript
// Dentro de createSale(), después del INSERT de items y antes del COMMIT:

// Registrar auditoría de venta
await client.query(`
    INSERT INTO audit_log (
        user_id, terminal_id, location_id, action_code,
        entity_type, entity_id, new_values, metadata
    ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'SALE_CREATE',
        'SALE', $4, $5::jsonb, $6::jsonb
    )
`, [
    userId,
    saleData.terminal_id,
    saleData.branch_id,
    saleId,
    JSON.stringify({
        total: saleData.total,
        payment_method: saleData.payment_method,
        items_count: saleData.items.length
    }),
    JSON.stringify({
        customer_rut: saleData.customer?.rut || null,
        dte_folio: saleData.dte_folio || null
    })
]);
```

---

## TAREA 4: Implementar forceCloseTerminalShift() con Auditoría Mejorada

### Archivo a modificar
`src/actions/terminals.ts`

### Cambio requerido
La función actual usa `logAction()` legacy. Actualizar para usar el nuevo sistema:

```typescript
export async function forceCloseTerminalShift(
    terminalId: string, 
    userId: string, 
    customReason?: string
) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Obtener datos actuales para auditoría
        const sessionRes = await client.query(`
            SELECT s.*, t.name as terminal_name, u.name as user_name
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.terminal_id = $1::uuid AND s.status = 'OPEN'
            FOR UPDATE
        `, [terminalId]);
        
        const oldSession = sessionRes.rows[0] || null;
        const reason = customReason || `Cierre forzado por Admin ${userId}`;
        
        // 2. Cerrar sesión si existe
        if (oldSession) {
            await client.query(`
                UPDATE cash_register_sessions
                SET status = 'CLOSED_FORCE',
                    closed_at = NOW(),
                    notes = $2
                WHERE id = $1
            `, [oldSession.id, reason]);
        }
        
        // 3. Resetear terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'CLOSED', current_cashier_id = NULL
            WHERE id = $1::uuid
        `, [terminalId]);
        
        // 4. AUDITORÍA CRÍTICA (obligatoria para FORCE_CLOSE)
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, session_id, action_code,
                entity_type, entity_id, 
                old_values, new_values, 
                justification
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, 'SESSION_FORCE_CLOSE',
                'SESSION', $3,
                $4::jsonb, $5::jsonb,
                $6
            )
        `, [
            userId,
            terminalId,
            oldSession?.id || null,
            oldSession ? JSON.stringify({
                status: oldSession.status,
                user_id: oldSession.user_id,
                opened_at: oldSession.opened_at
            }) : null,
            JSON.stringify({ status: 'CLOSED_FORCE' }),
            reason  // Justificación obligatoria
        ]);
        
        await client.query('COMMIT');
        return { success: true };
        
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Error forcing terminal close:', e);
        return { success: false, error: e.message };
    } finally {
        client.release();
    }
}
```

---

## TAREA 5: Crear Server Action de Conciliación

### Archivo a crear
`src/actions/reconciliation-v2.ts`

### Contenido completo

```typescript
'use server';

import { query, pool } from '@/lib/db';
import { z } from 'zod';

// Schema de validación
const PhysicalCountSchema = z.object({
    bills: z.record(z.string(), z.number()).optional(),
    coins: z.record(z.string(), z.number()).optional()
});

const CreateReconciliationSchema = z.object({
    sessionId: z.string().uuid(),
    declaredAmount: z.number().min(0),
    physicalCount: PhysicalCountSchema.optional(),
    userId: z.string().uuid()
});

const AddJustificationSchema = z.object({
    reconciliationId: z.string().uuid(),
    justificationType: z.enum([
        'COUNTING_ERROR',
        'CHANGE_GIVEN_WRONG',
        'SALE_NOT_RECORDED',
        'MOVEMENT_NOT_RECORDED',
        'THEFT_SUSPECTED',
        'SYSTEM_ERROR',
        'COINS_STUCK',
        'ROUNDING',
        'VOID_NOT_PROCESSED',
        'OTHER'
    ]),
    description: z.string().min(20, 'La descripción debe tener al menos 20 caracteres'),
    amountJustified: z.number(),
    evidenceUrls: z.array(z.string()).optional(),
    relatedSaleIds: z.array(z.string().uuid()).optional(),
    userId: z.string().uuid()
});

// Tipos de retorno
interface ReconciliationResult {
    success: boolean;
    reconciliationId?: string;
    difference?: number;
    requiresJustification?: boolean;
    error?: string;
}

/**
 * Crea una conciliación de arqueo para una sesión de caja
 */
export async function createReconciliation(
    input: z.infer<typeof CreateReconciliationSchema>
): Promise<ReconciliationResult> {
    const validated = CreateReconciliationSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, error: validated.error.errors[0].message };
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
                    AND type = 'EXTRA_INCOME'
                ), 0) AS movements_in,
                COALESCE((
                    SELECT SUM(amount) 
                    FROM cash_movements 
                    WHERE session_id = s.id 
                    AND type IN ('WITHDRAWAL', 'EXPENSE')
                ), 0) AS movements_out
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            WHERE s.id = $1::uuid
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

        // 3. Verificar si ya existe conciliación
        const existingCheck = await client.query(
            'SELECT id FROM cash_reconciliations WHERE session_id = $1::uuid',
            [sessionId]
        );
        
        if (existingCheck.rowCount > 0) {
            throw new Error('Ya existe una conciliación para esta sesión');
        }

        // 4. Crear registro de conciliación
        const { v4: uuidv4 } = await import('uuid');
        const reconciliationId = uuidv4();
        
        await client.query(`
            INSERT INTO cash_reconciliations (
                id, session_id, terminal_id, location_id,
                theoretical_amount, opening_amount, 
                cash_sales_total, cash_movements_in, cash_movements_out,
                declared_amount, physical_count, created_by,
                status
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                $5, $6, $7, $8, $9, $10, $11::jsonb, $12::uuid,
                CASE WHEN ABS($10 - $5) > 500 THEN 'PENDING' ELSE 'APPROVED' END
            )
        `, [
            reconciliationId,
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

        // 5. Registrar auditoría
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, location_id, session_id,
                action_code, entity_type, entity_id,
                new_values, metadata
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                'RECONCILIATION', 'RECONCILIATION', $5,
                $6::jsonb, $7::jsonb
            )
        `, [
            userId,
            session.terminal_id,
            session.location_id,
            sessionId,
            reconciliationId,
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
            reconciliationId,
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

/**
 * Agrega una justificación a una conciliación
 */
export async function addJustification(
    input: z.infer<typeof AddJustificationSchema>
): Promise<{ success: boolean; error?: string }> {
    const validated = AddJustificationSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, error: validated.error.errors[0].message };
    }

    const { 
        reconciliationId, justificationType, description, 
        amountJustified, evidenceUrls, relatedSaleIds, userId 
    } = validated.data;

    try {
        const { v4: uuidv4 } = await import('uuid');
        
        // 1. Insertar justificación
        await query(`
            INSERT INTO reconciliation_justifications (
                id, reconciliation_id, justification_type, description,
                amount_justified, evidence_urls, related_sale_ids, created_by
            ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid)
        `, [
            uuidv4(),
            reconciliationId,
            justificationType,
            description,
            amountJustified,
            evidenceUrls || [],
            relatedSaleIds || [],
            userId
        ]);

        // 2. Verificar si la diferencia está completamente justificada
        const totals = await query(`
            SELECT 
                cr.difference,
                COALESCE(SUM(rj.amount_justified), 0) as total_justified
            FROM cash_reconciliations cr
            LEFT JOIN reconciliation_justifications rj ON rj.reconciliation_id = cr.id
            WHERE cr.id = $1::uuid
            GROUP BY cr.id, cr.difference
        `, [reconciliationId]);

        if (totals.rows.length > 0) {
            const { difference, total_justified } = totals.rows[0];
            const absDiff = Math.abs(Number(difference));
            const justified = Number(total_justified);
            
            // Si justificado >= 90% de la diferencia, auto-aprobar
            if (justified >= absDiff * 0.9) {
                await query(`
                    UPDATE cash_reconciliations 
                    SET status = 'APPROVED', 
                        approved_at = NOW(),
                        approval_notes = 'Auto-aprobado: diferencia justificada'
                    WHERE id = $1::uuid
                `, [reconciliationId]);
            }
        }

        // 3. Auditoría
        await query(`
            INSERT INTO audit_log (
                user_id, action_code, entity_type, entity_id,
                new_values, justification
            ) VALUES (
                $1::uuid, 'RECONCILIATION_JUSTIFY', 'RECONCILIATION', $2,
                $3::jsonb, $4
            )
        `, [
            userId,
            reconciliationId,
            JSON.stringify({
                type: justificationType,
                amount: amountJustified
            }),
            description
        ]);

        return { success: true };
    } catch (error: any) {
        console.error('Justification error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Obtiene conciliaciones pendientes de aprobación
 */
export async function getPendingReconciliations(locationId?: string) {
    try {
        let queryStr = `
            SELECT 
                cr.*,
                u.name as cashier_name,
                t.name as terminal_name,
                (SELECT COUNT(*) FROM reconciliation_justifications rj WHERE rj.reconciliation_id = cr.id) as justification_count,
                (SELECT COALESCE(SUM(amount_justified), 0) FROM reconciliation_justifications rj WHERE rj.reconciliation_id = cr.id) as total_justified
            FROM cash_reconciliations cr
            JOIN users u ON cr.created_by = u.id
            JOIN terminals t ON cr.terminal_id = t.id
            WHERE cr.status = 'PENDING'
        `;
        
        const params: any[] = [];
        if (locationId) {
            queryStr += ' AND cr.location_id = $1::uuid';
            params.push(locationId);
        }
        
        queryStr += ' ORDER BY ABS(cr.difference) DESC, cr.created_at ASC';

        const result = await query(queryStr, params);
        return { success: true, data: result.rows };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Aprueba o rechaza una conciliación (solo managers)
 */
export async function reviewReconciliation(
    reconciliationId: string,
    managerId: string,
    action: 'APPROVE' | 'REJECT' | 'ESCALATE',
    notes: string
): Promise<{ success: boolean; error?: string }> {
    if (!notes || notes.length < 10) {
        return { success: false, error: 'Debe proporcionar notas de al menos 10 caracteres' };
    }

    try {
        const newStatus = action === 'APPROVE' ? 'APPROVED' 
                        : action === 'REJECT' ? 'REJECTED' 
                        : 'ESCALATED';

        await query(`
            UPDATE cash_reconciliations
            SET status = $2,
                approved_at = NOW(),
                approved_by = $3::uuid,
                approval_notes = $4
            WHERE id = $1::uuid
        `, [reconciliationId, newStatus, managerId, notes]);

        // Auditoría
        await query(`
            INSERT INTO audit_log (
                user_id, action_code, entity_type, entity_id,
                new_values, justification
            ) VALUES (
                $1::uuid, 'RECONCILIATION', 'RECONCILIATION', $2,
                $3::jsonb, $4
            )
        `, [
            managerId,
            reconciliationId,
            JSON.stringify({ status: newStatus, action }),
            notes
        ]);

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

---

## TAREA 6: Ejecutar Migraciones de Base de Datos

### Pre-requisito
Hacer backup de la base de datos antes de ejecutar.

### Orden de ejecución

```bash
# 1. REQUIERE VENTANA DE MANTENIMIENTO (5-15 min)
# Avisar a usuarios que el sistema estará en mantenimiento
psql $DATABASE_URL -f src/db/migrations/004_uuid_standardization.sql

# 2. NO requiere downtime
psql $DATABASE_URL -f src/db/migrations/005_audit_system.sql

# 3. NO requiere downtime  
psql $DATABASE_URL -f src/db/migrations/006_reconciliation_module.sql
```

### Verificación post-migración
Ejecutar las siguientes queries para verificar:

```sql
-- Verificar tablas creadas
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('audit_log', 'audit_action_catalog', 'cash_reconciliations', 'reconciliation_justifications');

-- Verificar triggers
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trigger_audit%';

-- Verificar que terminals.id es UUID
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'terminals' AND column_name IN ('id', 'location_id');
```

---

## TAREA 7: Actualizar Imports en Archivos Existentes

### Archivos a actualizar

1. **`src/actions/terminals.ts`**
   - Agregar import: `import { pool } from '@/lib/db';`
   - Verificar que `query` viene de `@/lib/db`

2. **`src/actions/sales.ts`**
   - Ya tiene `pool` importado, solo agregar auditoría

3. **Crear barrel export en `src/actions/index.ts`** (si no existe):
```typescript
export * from './terminals';
export * from './sales';
export * from './cash';
export * from './reconciliation-v2';
export * from './treasury';
```

---

## VALIDACIÓN FINAL

Después de completar todas las tareas, verificar:

### Tests manuales requeridos

1. **Test de apertura de terminal:**
   - Abrir terminal con usuario A
   - Intentar abrir mismo terminal con usuario B (debe fallar)
   - Verificar registro en audit_log

2. **Test de cierre de terminal:**
   - Cerrar terminal
   - Verificar que se crea remesa si hay retiro
   - Verificar registro en audit_log

3. **Test de venta:**
   - Crear venta
   - Verificar registro en audit_log con action_code 'SALE_CREATE'

4. **Test de conciliación:**
   - Cerrar sesión
   - Crear conciliación con diferencia > $500
   - Verificar que status es 'PENDING'
   - Agregar justificación
   - Verificar auditoría

### Query de verificación de auditoría
```sql
SELECT action_code, COUNT(*), MAX(created_at) as last_occurrence
FROM audit_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY action_code
ORDER BY last_occurrence DESC;
```

---

## NOTAS IMPORTANTES

1. **NO modificar** las migraciones SQL después de ejecutarlas en producción
2. **SIEMPRE** hacer backup antes de migraciones
3. **Los triggers de inmutabilidad** en audit_log previenen UPDATE/DELETE - esto es intencional
4. **Las justificaciones** son obligatorias para diferencias > $500
5. **El checksum** en audit_log crea una cadena tipo blockchain para detectar manipulación

---

## CONTACTO

Si encuentras problemas o tienes dudas, los documentos de referencia están en:
- `docs/ARQUITECTURA_AUDIT_FINANCIERO_v3.1.md`
- `docs/RESUMEN_EJECUTIVO_ARQUITECTURA.md`
