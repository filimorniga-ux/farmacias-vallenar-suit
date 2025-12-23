# MEGAPROMPT: IMPLEMENTACIÓN ARQUITECTURA PHARMA-SYNAPSE v3.1

## ROL
Actúa como **Ingeniero de Software Senior Full-Stack** especializado en:
- Sistemas financieros críticos (POS, auditoría fiscal)
- Seguridad y prevención de race conditions
- PostgreSQL avanzado (transacciones, bloqueos)
- Next.js 14 con Server Actions

## CONTEXTO CRÍTICO
El sistema **Pharma-Synapse v3.1** (ERP farmacéutico para Farmacias Vallenar, Chile) tiene vulnerabilidades graves detectadas en auditoría:

| Problema | Severidad | Impacto |
|----------|-----------|---------|
| Race condition en `openTerminal()` | 🔴 CRÍTICA | Dos cajeros pueden abrir mismo terminal |
| IDs mezclados TEXT/UUID | 🔴 CRÍTICA | Foreign keys rotas, datos huérfanos |
| Sin sistema de auditoría real | 🔴 ALTA | Incumplimiento fiscal SII Chile |
| Sin módulo de conciliación | 🟡 ALTA | Descuadres sin trazabilidad |

## DOCUMENTACIÓN DE REFERENCIA
**LEER ANTES DE COMENZAR:**
- `docs/ARQUITECTURA_AUDIT_FINANCIERO_v3.1.md` - Análisis técnico completo
- `docs/PROMPT_ANTIGRAVITY_IMPLEMENTACION.md` - Código detallado de cada función

---

# FASE 1: FUNDAMENTOS (Ejecutar en orden)

---

## 🛠️ TAREA 1: SEGURIDAD BÁSICA

### 1.1 Actualizar `.gitignore` en raíz del proyecto

```gitignore
# --- Security & Environment ---
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
*.pem
*.key
*.pfx

# --- Dependencies ---
node_modules/
.pnp
.pnp.js

# --- Next.js ---
.next/
out/

# --- Database ---
*.db
*.sqlite

# --- System ---
.DS_Store
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# --- IDE ---
.idea/
.vscode/
*.swp
```

---

## 🛠️ TAREA 2: MIGRACIONES DE BASE DE DATOS

### 2.1 Ejecutar migración de estandarización UUID
**Archivo:** `src/db/migrations/004_uuid_standardization.sql`
**⚠️ REQUIERE VENTANA DE MANTENIMIENTO (5-15 min)**

```bash
# Primero hacer backup
pg_dump -Fc $DATABASE_URL > backup_pre_migration.dump

# Ejecutar migración
psql $DATABASE_URL -f src/db/migrations/004_uuid_standardization.sql
```

### 2.2 Ejecutar migración de sistema de auditoría
**Archivo:** `src/db/migrations/005_audit_system.sql`
**✅ No requiere downtime**

```bash
psql $DATABASE_URL -f src/db/migrations/005_audit_system.sql
```

### 2.3 Ejecutar migración de conciliación
**Archivo:** `src/db/migrations/006_reconciliation_module.sql`
**✅ No requiere downtime**

```bash
psql $DATABASE_URL -f src/db/migrations/006_reconciliation_module.sql
```

### 2.4 Verificación post-migración
Ejecutar esta query para confirmar:

```sql
-- Verificar tablas creadas
SELECT table_name FROM information_schema.tables 
WHERE table_name IN (
    'audit_log', 
    'audit_action_catalog', 
    'cash_reconciliations', 
    'reconciliation_justifications',
    'reconciliation_alerts'
);

-- Debe retornar 5 filas
```

**CHECKPOINT:** Confirma que las 5 tablas existen antes de continuar.

---

## 🛠️ TAREA 3: BACKEND - ADAPTADOR DE AUDITORÍA

### 3.1 Crear/Actualizar `src/lib/audit.ts`

```typescript
'use server';

import { query, pool } from '@/lib/db';
import { headers } from 'next/headers';

// Tipos de acciones auditables
export type AuditAction = 
    | 'SALE_CREATE' | 'SALE_VOID' | 'SALE_REFUND'
    | 'SESSION_OPEN' | 'SESSION_CLOSE' | 'SESSION_FORCE_CLOSE' | 'SESSION_AUTO_CLOSE'
    | 'RECONCILIATION' | 'RECONCILIATION_JUSTIFY'
    | 'CASH_MOVEMENT' | 'PRICE_CHANGE' | 'STOCK_ADJUST'
    | 'USER_LOGIN' | 'USER_LOGOUT' | 'USER_LOGIN_FAILED';

export interface AuditContext {
    userId: string;
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

// Acciones que requieren justificación obligatoria
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
                    error: `La acción ${payload.action} requiere justificación de al menos 10 caracteres` 
                };
            }
        }

        // Obtener IP y User-Agent
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
        
        // Para acciones críticas, propagar el error
        if (CRITICAL_ACTIONS.includes(payload.action)) {
            throw new Error(`AUDIT_CRITICAL_FAILURE: ${error.message}`);
        }
        
        return { success: false, error: error.message };
    }
}

/**
 * Wrapper para operaciones que REQUIEREN auditoría exitosa
 * Si la auditoría falla, la operación se revierte
 */
export async function withAudit<T>(
    context: AuditContext,
    payload: AuditPayload,
    operation: (client: any) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Ejecutar operación principal
        const result = await operation(client);
        
        // Registrar auditoría dentro de la transacción
        await client.query(`
            INSERT INTO audit_log (
                user_id, user_name, user_role,
                session_id, terminal_id, location_id,
                action_code, entity_type, entity_id,
                old_values, new_values, metadata, justification
            ) VALUES (
                $1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid,
                $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13
            )
        `, [
            context.userId, context.userName, context.userRole,
            context.sessionId, context.terminalId, context.locationId,
            payload.action, payload.entityType, payload.entityId,
            payload.oldValues ? JSON.stringify(payload.oldValues) : null,
            payload.newValues ? JSON.stringify(payload.newValues) : null,
            payload.metadata ? JSON.stringify(payload.metadata) : null,
            payload.justification
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

// Compatibilidad con sistema legacy
export async function logAction(
    usuario: string,
    accion: string,
    detalle: string,
    ip?: string
): Promise<{ success: boolean }> {
    return auditLog(
        { userId: usuario, userName: usuario },
        { 
            action: 'SESSION_OPEN' as AuditAction, // Fallback
            entityType: 'LEGACY',
            entityId: 'N/A',
            metadata: { legacy_action: accion, legacy_detail: detalle }
        }
    );
}
```

**CHECKPOINT:** Verifica que el archivo compila sin errores de TypeScript.

---

## 🛠️ TAREA 4: REFACTORIZAR `openTerminal()` CON BLOQUEO PESIMISTA

### 4.1 Modificar `src/actions/terminals.ts`

Reemplazar la función `openTerminal` existente con esta versión segura:

```typescript
/**
 * Abre un terminal de forma segura con bloqueo pesimista
 * Previene race conditions y "terminales zombie"
 */
export async function openTerminal(
    terminalId: string, 
    userId: string, 
    initialCash: number
) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. BLOQUEO PESIMISTA - Nadie más puede tocar este terminal
        const termRes = await client.query(
            'SELECT * FROM terminals WHERE id = $1::uuid FOR UPDATE NOWAIT',
            [terminalId]
        );
        
        if (termRes.rows.length === 0) {
            throw new Error('Terminal no encontrado');
        }
        
        const terminal = termRes.rows[0];
        
        if (terminal.status === 'OPEN') {
            // Verificar si es el mismo usuario (reconexión)
            if (terminal.current_cashier_id === userId) {
                await client.query('ROLLBACK');
                
                // Buscar sesión activa existente
                const existingSession = await query(`
                    SELECT id, opening_amount, opened_at 
                    FROM cash_register_sessions 
                    WHERE terminal_id = $1::uuid AND user_id = $2::uuid AND status = 'OPEN'
                `, [terminalId, userId]);
                
                if (existingSession.rows.length > 0) {
                    return {
                        success: true,
                        data: {
                            id: existingSession.rows[0].id,
                            terminal_id: terminalId,
                            user_id: userId,
                            start_time: new Date(existingSession.rows[0].opened_at).getTime(),
                            opening_amount: Number(existingSession.rows[0].opening_amount),
                            status: 'ACTIVE',
                            reconnected: true
                        }
                    };
                }
            }
            throw new Error('TERMINAL_ALREADY_OPEN');
        }
        
        // 2. Auto-cerrar sesiones zombie del usuario
        await client.query(`
            UPDATE cash_register_sessions
            SET status = 'CLOSED_AUTO', 
                closed_at = NOW(),
                notes = 'Auto-cerrado por nueva apertura en otro terminal'
            WHERE user_id = $1::uuid AND status = 'OPEN'
        `, [userId]);
        
        // 3. Crear movimiento de apertura
        const { v4: uuidv4 } = await import('uuid');
        const movementId = uuidv4();
        
        await client.query(`
            INSERT INTO cash_movements (
                id, terminal_id, user_id, type, amount, reason, timestamp
            ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'OPENING', $4, 'Apertura de Caja', NOW())
        `, [movementId, terminalId, userId, initialCash]);
        
        // 4. Crear sesión
        const sessionId = uuidv4();
        await client.query(`
            INSERT INTO cash_register_sessions (
                id, terminal_id, user_id, opening_amount, status, opened_at
            ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'OPEN', NOW())
        `, [sessionId, terminalId, userId, initialCash]);
        
        // 5. Actualizar terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'OPEN', current_cashier_id = $2::uuid
            WHERE id = $1::uuid
        `, [terminalId, userId]);
        
        // 6. Registrar auditoría
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, location_id, action_code, 
                entity_type, entity_id, new_values
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, 'SESSION_OPEN',
                'SESSION', $4, $5::jsonb
            )
        `, [
            userId, 
            terminalId, 
            terminal.location_id,
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
        
        // Error de lock no disponible (otro proceso tiene el lock)
        if (e.code === '55P03') {
            return { 
                success: false, 
                error: 'Terminal ocupado por otro proceso. Intente en unos segundos.' 
            };
        }
        
        if (e.message === 'TERMINAL_ALREADY_OPEN') {
            return { 
                success: false, 
                error: 'El terminal ya está siendo usado por otro cajero.' 
            };
        }
        
        console.error('Error in openTerminal:', e);
        return { success: false, error: e.message || 'Error al abrir terminal' };
        
    } finally {
        client.release();
    }
}
```

### 4.2 Agregar import de `pool` si no existe

Al inicio de `src/actions/terminals.ts`, verificar que exista:

```typescript
import { query, pool } from '@/lib/db';
```

**CHECKPOINT:** Verificar que `openTerminal` usa `FOR UPDATE NOWAIT` y maneja el error `55P03`.

---

## 🛠️ TAREA 5: REFACTORIZAR `closeTerminal()` Y `forceCloseTerminalShift()`

### 5.1 Actualizar `closeTerminal` en `src/actions/terminals.ts`

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
        
        const terminal = termRes.rows[0];
        
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
            INSERT INTO cash_movements (
                id, terminal_id, session_id, user_id, type, amount, reason, timestamp
            ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'CLOSING', $5, $6, NOW())
        `, [uuidv4(), terminalId, session.id, userId, finalCash, `Cierre: ${comments}`]);
        
        // 4. Cerrar sesión
        await client.query(`
            UPDATE cash_register_sessions
            SET status = 'CLOSED',
                closed_at = NOW(),
                closing_amount = $2,
                notes = $3
            WHERE id = $1::uuid
        `, [session.id, finalCash, comments]);
        
        // 5. Cerrar terminal
        await client.query(`
            UPDATE terminals 
            SET status = 'CLOSED', current_cashier_id = NULL
            WHERE id = $1::uuid
        `, [terminalId]);
        
        // 6. Crear remesa si hay retiro
        if (withdrawalAmount && withdrawalAmount > 0) {
            await client.query(`
                INSERT INTO treasury_remittances (
                    id, location_id, source_terminal_id, amount, 
                    status, created_by, created_at
                ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'PENDING_RECEIPT', $5::uuid, NOW())
            `, [uuidv4(), terminal.location_id, terminalId, withdrawalAmount, userId]);
        }
        
        // 7. Auditoría
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, location_id, session_id,
                action_code, entity_type, entity_id, new_values
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                'SESSION_CLOSE', 'SESSION', $4, $5::jsonb
            )
        `, [
            userId, terminalId, terminal.location_id, session.id,
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

### 5.2 Actualizar `forceCloseTerminalShift` en `src/actions/terminals.ts`

```typescript
export async function forceCloseTerminalShift(
    terminalId: string, 
    adminUserId: string, 
    justification: string
) {
    // Validar justificación (obligatoria para cierre forzado)
    if (!justification || justification.length < 10) {
        return { 
            success: false, 
            error: 'El cierre forzado requiere una justificación de al menos 10 caracteres' 
        };
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. Obtener datos actuales para auditoría
        const sessionRes = await client.query(`
            SELECT s.*, t.location_id, t.name as terminal_name, u.name as user_name
            FROM cash_register_sessions s
            JOIN terminals t ON s.terminal_id = t.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.terminal_id = $1::uuid AND s.status = 'OPEN'
            FOR UPDATE
        `, [terminalId]);
        
        const oldSession = sessionRes.rows[0] || null;
        
        // 2. Cerrar sesión si existe
        if (oldSession) {
            await client.query(`
                UPDATE cash_register_sessions
                SET status = 'CLOSED_FORCE',
                    closed_at = NOW(),
                    notes = $2
                WHERE id = $1::uuid
            `, [oldSession.id, justification]);
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
                user_id, terminal_id, location_id, session_id,
                action_code, entity_type, entity_id, 
                old_values, new_values, justification
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                'SESSION_FORCE_CLOSE', 'SESSION', $4,
                $5::jsonb, $6::jsonb, $7
            )
        `, [
            adminUserId,
            terminalId,
            oldSession?.location_id || null,
            oldSession?.id || null,
            oldSession ? JSON.stringify({
                status: oldSession.status,
                user_id: oldSession.user_id,
                user_name: oldSession.user_name,
                opened_at: oldSession.opened_at
            }) : null,
            JSON.stringify({ status: 'CLOSED_FORCE' }),
            justification
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

**CHECKPOINT:** Verificar que `forceCloseTerminalShift` requiere `justification` obligatoria.

---

## 🛠️ TAREA 6: ACTUALIZAR `createSale()` CON AUDITORÍA

### 6.1 Modificar `src/actions/sales.ts`

Buscar la función `createSale` y agregar el registro de auditoría **ANTES del COMMIT**:

```typescript
// ... código existente de createSale ...

// AGREGAR DESPUÉS de insertar items y ANTES de COMMIT:

// Registrar auditoría de venta
await client.query(`
    INSERT INTO audit_log (
        user_id, terminal_id, location_id,
        action_code, entity_type, entity_id,
        new_values, metadata
    ) VALUES (
        $1::uuid, $2::uuid, $3::uuid,
        'SALE_CREATE', 'SALE', $4,
        $5::jsonb, $6::jsonb
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

// await client.query('COMMIT'); <- Ya existe
```

---

## 🛠️ TAREA 7: CREAR MÓDULO DE CONCILIACIÓN

### 7.1 Crear archivo `src/actions/reconciliation-v2.ts`

El código completo está en `docs/PROMPT_ANTIGRAVITY_IMPLEMENTACION.md` Tarea 5.

Funciones a implementar:
- `createReconciliation()` - Crear conciliación de arqueo
- `addJustification()` - Agregar justificación a diferencia
- `getPendingReconciliations()` - Listar pendientes de aprobación
- `reviewReconciliation()` - Aprobar/rechazar conciliación

---

# VERIFICACIÓN FINAL

Después de completar todas las tareas, ejecutar estas verificaciones:

## 1. Verificar tablas en BD
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('audit_log', 'cash_reconciliations', 'reconciliation_justifications');
-- Debe retornar 3 filas
```

## 2. Verificar auditoría funciona
```sql
SELECT action_code, COUNT(*), MAX(created_at) 
FROM audit_log 
GROUP BY action_code 
ORDER BY MAX(created_at) DESC;
```

## 3. Test manual de apertura de terminal
1. Abrir terminal con usuario A
2. Intentar abrir MISMO terminal con usuario B en otra ventana
3. Usuario B debe recibir error "Terminal ocupado"
4. Verificar que hay registro en audit_log con action_code = 'SESSION_OPEN'

---

# INSTRUCCIÓN FINAL

1. **Ejecuta las tareas en orden** (1 → 7)
2. **Verifica cada CHECKPOINT** antes de continuar
3. **Si encuentras errores de compilación**, revisa los imports
4. **Confirma cuando termines** cada fase para continuar con la siguiente

**Prioridad de ejecución:**
- TAREA 1-2: Seguridad y BD (hacer primero)
- TAREA 3-6: Backend (bloqueo pesimista y auditoría)
- TAREA 7: Conciliación (puede esperar al Sprint 2)

---

*Prompt generado para Antigravity (Opus 4.5 / Sonnet 4.5)*
*Pharma-Synapse v3.1 - Farmacias Vallenar*
