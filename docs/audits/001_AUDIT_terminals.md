# 🔬 AUDITORÍA #001: terminals.ts vs terminals-v2.ts
## Pharma-Synapse v3.1 - Módulo de Terminales POS
### Fecha: 2024-12-23 | Auditor: Sistema

---

## 📊 MÉTRICAS

| Archivo | Líneas | Funciones | Complejidad |
|---------|--------|-----------|-------------|
| `terminals.ts` | 462 | 10 | 🔴 ALTA |
| `terminals-v2.ts` | 222 | 2 | 🟢 BAJA |

---

## 🔴 VULNERABILIDADES CRÍTICAS EN `terminals.ts`

### 1. **RACE CONDITION - Sin Bloqueo Pesimista** (Severidad: 🔴 CRÍTICA)

**Ubicación:** Líneas 70-79

```typescript
// ❌ CÓDIGO ACTUAL (INSEGURO)
const termRes = await query('SELECT * FROM terminals WHERE id = $1', [terminalId]);
// ... tiempo pasa ...
if (terminal.status === 'OPEN') {
    return { success: false, error: 'Terminal is already open' };
}
// Otro proceso puede haber abierto el terminal entre SELECT y UPDATE
```

**Problema:** 
- Entre el SELECT y el UPDATE hay una ventana de tiempo
- Dos usuarios pueden pasar la validación simultáneamente
- Resultado: Dos sesiones abiertas para el mismo terminal

**Solución:** Usar `FOR UPDATE NOWAIT` (como en v2)

---

### 2. **NO USA TRANSACCIONES REALES** (Severidad: 🔴 CRÍTICA)

**Ubicación:** Líneas 57-153 (`openTerminal`)

```typescript
// ❌ CÓDIGO ACTUAL - Operaciones secuenciales SIN transacción
await createCashMovement(...);           // Paso 1
await query('UPDATE terminals...');       // Paso 2
await query('INSERT INTO sessions...');   // Paso 3 - Si falla aquí, pasos 1 y 2 ya se ejecutaron
```

**Problema:**
- Si falla en el paso 3, los pasos 1 y 2 NO se revierten
- Genera inconsistencia: Terminal OPEN pero sin sesión
- Estado "zombie"

**Intento de rollback manual (insuficiente):**
```typescript
// Línea 132 - Solo revierte terminal, NO el cash_movement
await query("UPDATE terminals SET status = 'CLOSED'...");
```

---

### 3. **IDs NO SON UUIDs VÁLIDOS** (Severidad: 🟡 MEDIA)

**Ubicación:** Líneas 28, 116

```typescript
// ❌ CÓDIGO ACTUAL
const id = data.hardware_id || `TERM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const newSessionId = `SESSION-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
```

**Problema:**
- No son UUIDs válidos
- Pueden causar conflictos con FKs que esperan UUID
- Difíciles de rastrear en auditoría

---

### 4. **AUDITORÍA NO INTEGRADA CON SISTEMA NUEVO** (Severidad: 🟡 MEDIA)

**Ubicación:** Líneas 409-453 (`forceCloseTerminalShift`)

```typescript
// ⚠️ Usa sistema legacy
const { logAction } = await import('./audit');
await logAction(userId, 'FORCE_CLOSE', reason);
```

**Problema:**
- Usa `audit.ts` legacy en lugar de `audit-v2.ts`
- No aprovecha las nuevas tablas `audit_log` y `audit_action_catalog`
- Sin checksums ni inmutabilidad

---

### 5. **closeTerminal NO CIERRA LA SESIÓN** (Severidad: 🔴 CRÍTICA)

**Ubicación:** Líneas 158-207

```typescript
// ❌ CÓDIGO ACTUAL - Solo actualiza terminal, NO la sesión
await query(`
    UPDATE terminals 
    SET status = 'CLOSED', current_cashier_id = NULL
    WHERE id = $1
`, [terminalId]);

// ⚠️ FALTA: UPDATE cash_register_sessions SET closed_at = NOW()...
```

**Problema:**
- El terminal se cierra pero la sesión queda "colgada"
- `closed_at` nunca se establece
- Genera sesiones zombie

---

### 6. **VALIDACIÓN DE ENTRADA INSUFICIENTE** (Severidad: 🟡 MEDIA)

**Ubicación:** Todas las funciones

```typescript
// ❌ Sin validación con Zod
export async function openTerminal(terminalId: string, userId: string, initialCash: number) {
    // No valida que terminalId sea UUID
    // No valida que initialCash sea >= 0
    // No sanitiza inputs
}
```

---

### 7. **CONSOLE.LOG EN PRODUCCIÓN** (Severidad: 🟢 BAJA)

**Ubicación:** Múltiples

```typescript
console.log(`🔌 Opening terminal ${terminalId}...`);
console.log(`✅ [Server Action] Terminals Found: ${result.rows.length}`);
console.error('❌ CRITICAL: Session Insert Failed:', insertError);
```

**Problema:**
- Expone información sensible en logs
- Debería usar logger estructurado

---

## ✅ FORTALEZAS DE `terminals-v2.ts`

### 1. **Transacciones Reales con SERIALIZABLE**
```typescript
await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
// ... operaciones atómicas ...
await client.query('COMMIT');
```

### 2. **Bloqueo Pesimista con FOR UPDATE**
```typescript
const termCheck = await client.query(`
    SELECT status, current_cashier_id FROM terminals WHERE id = $1 FOR UPDATE
`, [terminalId]);
```

### 3. **Validación con Zod**
```typescript
const OpenTerminalSchema = z.object({
    terminalId: z.string().uuid({ message: "ID de terminal inválido" }),
    userId: z.string().min(1, { message: "ID de usuario requerido" }),
    initialCash: z.number().min(0, { message: "El fondo inicial no puede ser negativo" })
});
```

### 4. **Logger Estructurado**
```typescript
logger.info({ terminalId, userId }, '🔐 [Atomic v2] Starting transaction');
logger.error({ err: error, terminalId, userId }, '❌ [Atomic v2] Transaction ROLLED BACK');
```

### 5. **Cleanup Automático de Sesiones Ghost**
```typescript
await client.query(`
    UPDATE cash_register_sessions 
    SET closed_at = NOW(), status = 'CLOSED_AUTO', notes = 'Auto-closed by new login v2'
    WHERE user_id = $1 AND closed_at IS NULL
`, [userId]);
```

---

## ⚠️ PROBLEMAS EN `terminals-v2.ts`

### 1. **Falta `FOR UPDATE NOWAIT`** (Severidad: 🟡 MEDIA)

```typescript
// ⚠️ ACTUAL
SELECT ... FOR UPDATE

// ✅ RECOMENDADO
SELECT ... FOR UPDATE NOWAIT
```

**Diferencia:** `NOWAIT` falla inmediatamente si el registro está bloqueado, en lugar de esperar indefinidamente.

### 2. **No Registra en `audit_log`** (Severidad: 🟡 MEDIA)

Debería insertar en `audit_log` dentro de la transacción:
```typescript
await client.query(`
    INSERT INTO audit_log (user_id, terminal_id, action_code, entity_type, entity_id, new_values)
    VALUES ($1, $2, 'SESSION_OPEN', 'SESSION', $3, $4::jsonb)
`, [userId, terminalId, newSessionId, JSON.stringify({ opening_amount: initialCash })]);
```

### 3. **Falta `forceCloseTerminalAtomic`** (Severidad: 🟡 MEDIA)

Solo tiene `openTerminalAtomic` y `closeTerminalAtomic`, pero no versión atómica de `forceClose`.

---

## 📋 MATRIZ DE FUNCIONES

| Función | v1 (terminals.ts) | v2 (terminals-v2.ts) | Usar |
|---------|-------------------|----------------------|------|
| `openTerminal` | ❌ Sin transacción | ✅ Atómica | **v2** |
| `closeTerminal` | ❌ No cierra sesión | ✅ Atómica | **v2** |
| `forceCloseTerminalShift` | ⚠️ Existe pero legacy | ❌ No existe | Crear en v2 |
| `createTerminal` | ⚠️ IDs no UUID | - | Refactorizar |
| `getTerminalsByLocation` | ✅ OK | - | Mantener |
| `getAvailableTerminalsForShift` | ✅ OK | - | Mantener |
| `updateTerminal` | ✅ OK | - | Mantener |
| `deleteTerminal` | ✅ Soft delete | - | Mantener |

---

## 🛠️ CORRECCIONES PROPUESTAS

### PRIORIDAD 1: Migrar a `terminals-v2.ts` (CRÍTICA)

**Acción:** Actualizar todos los imports en el frontend para usar `terminals-v2.ts`

```typescript
// ❌ ANTES
import { openTerminal, closeTerminal } from '@/actions/terminals';

// ✅ DESPUÉS
import { openTerminalAtomic, closeTerminalAtomic } from '@/actions/terminals-v2';
```

### PRIORIDAD 2: Agregar `FOR UPDATE NOWAIT`

```typescript
// En terminals-v2.ts, línea 62
const termCheck = await client.query(`
    SELECT status, current_cashier_id FROM terminals WHERE id = $1 FOR UPDATE NOWAIT
`, [terminalId]);
```

Y manejar el error:
```typescript
} catch (error: any) {
    await client.query('ROLLBACK');
    
    // Detectar lock timeout
    if (error.code === '55P03') {
        return { 
            success: false, 
            error: 'Terminal ocupado por otro proceso. Intente en unos segundos.' 
        };
    }
    
    return { success: false, error: error.message };
}
```

### PRIORIDAD 3: Integrar Auditoría

```typescript
// Después del INSERT de sesión, agregar:
await client.query(`
    INSERT INTO audit_log (
        user_id, terminal_id, action_code, entity_type, entity_id, new_values
    ) VALUES (
        $1::uuid, $2::uuid, 'SESSION_OPEN', 'SESSION', $3::uuid, $4::jsonb
    )
`, [userId, terminalId, newSessionId, JSON.stringify({ opening_amount: initialCash })]);
```

### PRIORIDAD 4: Crear `forceCloseTerminalAtomic`

```typescript
export async function forceCloseTerminalAtomic(
    terminalId: string, 
    adminUserId: string, 
    justification: string
) {
    // Validar justificación obligatoria (mín 10 caracteres)
    if (!justification || justification.length < 10) {
        return { success: false, error: 'Justificación requerida (mín. 10 caracteres)' };
    }

    const { pool } = await import('@/lib/db');
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Lock terminal
        const termRes = await client.query(`
            SELECT * FROM terminals WHERE id = $1 FOR UPDATE NOWAIT
        `, [terminalId]);

        // 2. Obtener sesión activa para auditoría
        const sessionRes = await client.query(`
            SELECT s.*, u.name as user_name 
            FROM cash_register_sessions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.terminal_id = $1 AND s.status = 'OPEN'
            FOR UPDATE
        `, [terminalId]);

        const oldSession = sessionRes.rows[0];

        // 3. Cerrar sesión si existe
        if (oldSession) {
            await client.query(`
                UPDATE cash_register_sessions
                SET status = 'CLOSED_FORCE', closed_at = NOW(), notes = $2
                WHERE id = $1
            `, [oldSession.id, justification]);
        }

        // 4. Cerrar terminal
        await client.query(`
            UPDATE terminals SET status = 'CLOSED', current_cashier_id = NULL
            WHERE id = $1
        `, [terminalId]);

        // 5. Auditoría OBLIGATORIA para force close
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, session_id, action_code, 
                entity_type, entity_id, old_values, new_values, justification
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, 'SESSION_FORCE_CLOSE',
                'SESSION', $3::uuid, $4::jsonb, $5::jsonb, $6
            )
        `, [
            adminUserId, 
            terminalId, 
            oldSession?.id,
            oldSession ? JSON.stringify({ 
                status: oldSession.status, 
                user_id: oldSession.user_id,
                user_name: oldSession.user_name 
            }) : null,
            JSON.stringify({ status: 'CLOSED_FORCE' }),
            justification
        ]);

        await client.query('COMMIT');
        return { success: true };

    } catch (error: any) {
        await client.query('ROLLBACK');
        
        if (error.code === '55P03') {
            return { success: false, error: 'Terminal bloqueado. Reintente.' };
        }
        
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}
```

### PRIORIDAD 5: Deprecar `terminals.ts`

Agregar al inicio del archivo:
```typescript
/**
 * @deprecated Use terminals-v2.ts para operaciones de apertura/cierre.
 * Este archivo se mantiene solo para funciones de lectura (getTerminalsByLocation, etc.)
 * Las funciones openTerminal y closeTerminal tienen race conditions conocidas.
 */
```

---

## 📊 RESUMEN DE HALLAZGOS

| Severidad | Cantidad | Archivos |
|-----------|----------|----------|
| 🔴 CRÍTICA | 3 | terminals.ts |
| 🟡 MEDIA | 4 | ambos |
| 🟢 BAJA | 1 | terminals.ts |

---

## ✅ CHECKLIST DE CORRECCIONES

- [ ] Migrar imports de `openTerminal` → `openTerminalAtomic`
- [ ] Migrar imports de `closeTerminal` → `closeTerminalAtomic`
- [ ] Agregar `FOR UPDATE NOWAIT` en terminals-v2.ts
- [ ] Manejar error `55P03` (lock not available)
- [ ] Integrar `audit_log` en transacciones
- [ ] Crear `forceCloseTerminalAtomic`
- [ ] Agregar deprecation notice a terminals.ts
- [ ] Actualizar tests para usar v2

---

## 📞 ACCIÓN REQUERIDA

**¿Deseas que implemente estas correcciones ahora?**

1. **Opción A**: Implemento todas las correcciones en `terminals-v2.ts`
2. **Opción B**: Genero un prompt para que Antigravity lo haga
3. **Opción C**: Continúo con la auditoría del siguiente archivo (`sales.ts`)

---

*Auditoría #001 completada*
*Siguiente: sales.ts (273 líneas)*
