# AUDITORÍA #004: Módulo de Tesorería (Treasury)
## Pharma-Synapse v3.1 - Análisis de Flujo de Fondos

**Fecha**: 2024-12-23
**Archivo Auditado**: `src/actions/treasury.ts` (339 líneas)
**Criticidad**: 🔴 ALTA (Manejo de fondos corporativos)

---

## 1. RESUMEN EJECUTIVO

El módulo de tesorería maneja transferencias entre cuentas financieras, remesas de caja a caja fuerte, y depósitos bancarios. Se identificaron **3 problemas CRÍTICOS**, **4 MEDIOS** y **2 BAJOS**.

### Evaluación General

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Transacciones | 🟢 BIEN | Usa BEGIN/COMMIT/ROLLBACK correctamente |
| Bloqueo Pesimista | 🔴 FALTA | Sin FOR UPDATE en operaciones concurrentes |
| Auditoría | 🔴 FALTA | Sin integración con audit_log |
| Validación | 🟡 PARCIAL | Falta validación de UUIDs |
| Permisos | 🔴 FALTA | Sin verificación de roles |

---

## 2. HALLAZGOS POSITIVOS ✅

### 2.1 Transacciones Implementadas
A diferencia de otros módulos, `treasury.ts` **sí implementa transacciones**:

```typescript
// depositToBank - Líneas 82-107
const client = await import('@/lib/db').then(mod => mod.pool.connect());
try {
    await client.query('BEGIN');
    // ... operaciones ...
    await client.query('COMMIT');
} catch (e) {
    await client.query('ROLLBACK');
    throw e;
} finally {
    client.release();
}
```

**Funciones con transacciones**:
- ✅ `depositToBank()` - Líneas 82-107
- ✅ `transferFunds()` - Líneas 143-165
- ✅ `confirmRemittance()` - Líneas 231-259

---

## 3. HALLAZGOS CRÍTICOS

### 3.1 CRÍTICO: Race Condition en Validación de Saldo

**Archivo**: `treasury.ts:56-63` y `132-135`

```typescript
// depositToBank
const safeRes = await query("SELECT balance, location_id FROM financial_accounts WHERE id = $1", [safeId]);
// ❌ SELECT sin FOR UPDATE - otro proceso puede modificar balance entre SELECT y UPDATE
const safe = safeRes.rows[0];
if (Number(safe.balance) < amount) {
    return { success: false, error: 'Fondos insuficientes en Caja Fuerte' };
}

// 80 líneas después...
await client.query("UPDATE financial_accounts SET balance = balance - $1 WHERE id = $2", [amount, safeId]);
```

**Riesgo**:
- Entre la validación y el UPDATE pueden pasar milisegundos
- Dos transferencias simultáneas pueden "aprobar" con el mismo saldo
- Resultado: saldo negativo

**Corrección**:
```typescript
export async function depositToBankAtomic(
    safeId: string, 
    amount: number, 
    userId: string
): Promise<{ success: boolean; error?: string }> {
    const pool = (await import('@/lib/db')).pool;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // 1. Bloquear cuenta origen con FOR UPDATE NOWAIT
        const safeRes = await client.query(`
            SELECT balance, location_id 
            FROM financial_accounts 
            WHERE id = $1 
            FOR UPDATE NOWAIT
        `, [safeId]);
        
        if (safeRes.rows.length === 0) {
            throw new Error('SAFE_NOT_FOUND');
        }
        
        const safe = safeRes.rows[0];
        if (Number(safe.balance) < amount) {
            throw new Error('INSUFFICIENT_FUNDS');
        }
        
        // 2. Buscar/crear cuenta banco (también bloqueada)
        let bankId: string;
        const bankRes = await client.query(`
            SELECT id FROM financial_accounts 
            WHERE location_id = $1 AND type = 'BANK'
            FOR UPDATE NOWAIT
        `, [safe.location_id]);
        
        if (bankRes.rows.length === 0) {
            bankId = uuidv4();
            await client.query(`
                INSERT INTO financial_accounts (id, location_id, name, type, balance) 
                VALUES ($1, $2, 'Cuenta Banco', 'BANK', 0)
            `, [bankId, safe.location_id]);
        } else {
            bankId = bankRes.rows[0].id;
        }
        
        // 3. Ejecutar transferencia
        await client.query(`
            UPDATE financial_accounts SET balance = balance - $1 WHERE id = $2
        `, [amount, safeId]);
        
        const txOutId = uuidv4();
        await client.query(`
            INSERT INTO treasury_transactions (id, account_id, amount, type, description, created_by)
            VALUES ($1, $2, $3, 'OUT', 'Depósito Bancario', $4)
        `, [txOutId, safeId, amount, userId]);
        
        await client.query(`
            UPDATE financial_accounts SET balance = balance + $1 WHERE id = $2
        `, [amount, bankId]);
        
        const txInId = uuidv4();
        await client.query(`
            INSERT INTO treasury_transactions (id, account_id, amount, type, description, created_by)
            VALUES ($1, $2, $3, 'IN', 'Depósito desde Caja Fuerte', $4)
        `, [txInId, bankId, amount, userId]);
        
        // 4. Registrar en audit_log
        await client.query(`
            INSERT INTO audit_log (id, user_id, action_code, entity_type, entity_id, new_values, created_at)
            VALUES ($1, $2, 'TREASURY_DEPOSIT', 'FINANCIAL_ACCOUNT', $3, $4, NOW())
        `, [uuidv4(), userId, safeId, JSON.stringify({ 
            from: safeId, 
            to: bankId, 
            amount,
            transactions: [txOutId, txInId]
        })]);
        
        await client.query('COMMIT');
        
        revalidatePath('/finance/treasury');
        return { success: true };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        
        if (error.code === '55P03') {
            return { success: false, error: 'Cuenta bloqueada por otra operación. Intente nuevamente.' };
        }
        if (error.message === 'SAFE_NOT_FOUND') {
            return { success: false, error: 'Caja Fuerte no encontrada' };
        }
        if (error.message === 'INSUFFICIENT_FUNDS') {
            return { success: false, error: 'Fondos insuficientes en Caja Fuerte' };
        }
        
        console.error('Deposit error:', error);
        return { success: false, error: 'Error procesando depósito' };
    } finally {
        client.release();
    }
}
```

---

### 3.2 CRÍTICO: Sin Integración con audit_log

Ninguna operación registra en `audit_log`:

| Función | Impacto Financiero | audit_log |
|---------|-------------------|-----------|
| `depositToBank()` | Alto | ❌ No |
| `transferFunds()` | Alto | ❌ No |
| `confirmRemittance()` | Alto | ❌ No |
| `createRemittance()` | Medio | ❌ No |
| `recordAutoTreasuryEntry()` | Medio | ❌ No |

**Impacto**:
- Imposible rastrear quién movió fondos
- Sin evidencia forense en caso de fraude
- Incumplimiento fiscal

---

### 3.3 CRÍTICO: createRemittance Sin Transacción

**Archivo**: `treasury.ts:190-207`

```typescript
export async function createRemittance(
    locationId: string,
    terminalId: string,
    amount: number,
    userId: string
): Promise<boolean> {
    try {
        await query(`
            INSERT INTO treasury_remittances (...)
            VALUES ($1, $2, $3, $4, 'PENDING_RECEIPT', $5, NOW())
        `, [uuidv4(), locationId, terminalId, amount, userId]);
        return true;  // ❌ Solo retorna boolean, sin detalles
    } catch (e) {
        console.error('Error creating remittance:', e);
        return false;  // ❌ Error silenciado
    }
}
```

**Problemas**:
1. Sin validación de `amount > 0`
2. Sin validación de UUIDs
3. Sin transacción (aunque es INSERT único, debería auditar)
4. Retorno `boolean` insuficiente

---

## 4. HALLAZGOS MEDIOS

### 4.1 MEDIO: Sin Verificación de Permisos

```typescript
export async function depositToBank(safeId: string, amount: number, userId: string) {
    // ❌ NO VERIFICA:
    // - ¿El usuario tiene rol MANAGER/ADMIN?
    // - ¿El usuario pertenece a esta ubicación?
    // - ¿El monto está dentro de límites permitidos?
}
```

**Corrección**:
```typescript
export async function depositToBank(
    safeId: string, 
    amount: number, 
    userId: string,
    userRole: string,
    userLocationId: string
) {
    // Verificar permisos
    const allowedRoles = ['MANAGER', 'ADMIN', 'QF', 'GERENTE_GENERAL'];
    if (!allowedRoles.includes(userRole)) {
        return { success: false, error: 'UNAUTHORIZED: Insufficient permissions' };
    }
    
    // Verificar límites (configurable)
    const DAILY_LIMIT = 10000000; // $10M CLP
    const todayDeposits = await getTodayDeposits(safeId);
    if (todayDeposits + amount > DAILY_LIMIT) {
        return { success: false, error: 'LIMIT_EXCEEDED: Daily deposit limit reached' };
    }
    
    // ... resto de lógica ...
}
```

---

### 4.2 MEDIO: recordAutoTreasuryEntry Deprecado pero Usado

**Archivo**: `treasury.ts:273-296`

```typescript
/**
 * @deprecated Use createRemittance instead for Custody Chain
 */
export async function recordAutoTreasuryEntry(locationId: string, amount: number, description: string, relatedEntityId?: string) {
    // ❌ Función deprecated aún en uso
    // ❌ Sin transacción
    // ❌ Bug en línea 289: 'type' es 'IN' como valor, no columna
}
```

**Bug específico línea 289**:
```typescript
await query(`
    INSERT INTO treasury_transactions (id, account_id, amount, type, description, related_entity_id)
    VALUES ($1, $2, $3, 'IN', $4, $5)
`, [uuidv4(), safeId, amount, 'IN', description, relatedEntityId]);
                                //  ❌ $4 es 'IN' pero la descripción va en $4
```

**Query malformada**: El parámetro `$4` está duplicado en significado.

---

### 4.3 MEDIO: Validación Incompleta de UUIDs

**Archivo**: Múltiples funciones

```typescript
// Ninguna función valida formato UUID de parámetros
export async function getFinancialAccounts(locationId: string) {
    // locationId podría ser "'; DROP TABLE financial_accounts; --"
    const res = await query("SELECT * FROM financial_accounts WHERE ...", [locationId]);
}
```

**Corrección**:
```typescript
import { isValidUUID } from '@/lib/utils';

export async function getFinancialAccounts(locationId: string) {
    if (!isValidUUID(locationId)) {
        return { success: false, error: 'Invalid location ID format' };
    }
    // ...
}
```

---

### 4.4 MEDIO: Auto-creación de Cuenta Banco

**Archivo**: `treasury.ts:73-80`

```typescript
if (bankRes.rows.length === 0) {
    // ❌ Crea cuenta banco automáticamente
    bankId = uuidv4();
    await query("INSERT INTO financial_accounts ...");
}
```

**Riesgo**: 
- Auto-creación de entidades financieras es peligrosa
- Debería fallar si no existe cuenta banco configurada

---

## 5. HALLAZGOS BAJOS

### 5.1 BAJO: Magic Number para LIMIT

```typescript
// Líneas 43, 331
"... ORDER BY created_at DESC LIMIT 50"
"... ORDER BY r.created_at DESC LIMIT 100"
```

Debería ser constante configurable.

---

### 5.2 BAJO: Inconsistencia en Nombres de Columnas

```typescript
// Línea 317
u1."fullName" as cashier_name,  // fullName con camelCase
u2."fullName" as receiver_name
```

Inconsistente con convención `snake_case` del resto del schema.

---

## 6. MATRIZ DE DEPENDENCIAS

```
treasury.ts
├── @/lib/db (query, pool)
├── uuid (v4)
├── next/cache (revalidatePath)
└── Tablas:
    ├── financial_accounts
    ├── treasury_transactions
    └── treasury_remittances
```

---

## 7. RECOMENDACIONES DE CORRECCIÓN

### Prioridad CRÍTICA (Inmediata)
1. **Agregar FOR UPDATE NOWAIT** a todas las validaciones de saldo
2. **Integrar audit_log** en operaciones financieras
3. **Corregir bug** en `recordAutoTreasuryEntry`

### Prioridad ALTA (Esta semana)
4. Agregar verificación de permisos
5. Validar UUIDs en todas las funciones
6. Eliminar auto-creación de cuentas

### Prioridad MEDIA (Próximo sprint)
7. Reemplazar función deprecated
8. Definir constantes para LIMIT
9. Agregar tests unitarios

---

## 8. CÓDIGO CORREGIDO PROPUESTO

### treasury-v2.ts (Nuevo archivo)

```typescript
'use server';

import { pool } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';
import { isValidUUID } from '@/lib/utils';
import { auditLog } from '@/lib/audit-v2';

// Constantes
const TREASURY_LIMITS = {
    MAX_SINGLE_TRANSFER: 50000000, // $50M CLP
    DAILY_DEPOSIT_LIMIT: 100000000, // $100M CLP
    QUERY_LIMIT: 100
};

const TREASURY_ROLES = ['MANAGER', 'ADMIN', 'QF', 'GERENTE_GENERAL'];

// Tipos
export interface TreasuryOperationContext {
    userId: string;
    userRole: string;
    userLocationId: string;
    ipAddress?: string;
}

/**
 * Transferencia atómica con bloqueo pesimista y auditoría
 */
export async function transferFundsAtomic(
    fromId: string,
    toId: string,
    amount: number,
    description: string,
    context: TreasuryOperationContext
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    // Validaciones
    if (!isValidUUID(fromId) || !isValidUUID(toId)) {
        return { success: false, error: 'Invalid account ID format' };
    }
    
    if (amount <= 0 || amount > TREASURY_LIMITS.MAX_SINGLE_TRANSFER) {
        return { success: false, error: 'Invalid amount' };
    }
    
    if (!TREASURY_ROLES.includes(context.userRole)) {
        return { success: false, error: 'UNAUTHORIZED' };
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // Bloquear ambas cuentas
        const sourceRes = await client.query(`
            SELECT id, balance, location_id FROM financial_accounts 
            WHERE id = $1 FOR UPDATE NOWAIT
        `, [fromId]);
        
        if (sourceRes.rowCount === 0) {
            throw new Error('SOURCE_NOT_FOUND');
        }
        
        if (Number(sourceRes.rows[0].balance) < amount) {
            throw new Error('INSUFFICIENT_FUNDS');
        }
        
        const destRes = await client.query(`
            SELECT id FROM financial_accounts 
            WHERE id = $1 FOR UPDATE NOWAIT
        `, [toId]);
        
        if (destRes.rowCount === 0) {
            throw new Error('DEST_NOT_FOUND');
        }
        
        // Ejecutar transferencia
        await client.query(`
            UPDATE financial_accounts SET balance = balance - $1 WHERE id = $2
        `, [amount, fromId]);
        
        const txOutId = uuidv4();
        await client.query(`
            INSERT INTO treasury_transactions (id, account_id, amount, type, description, created_by, created_at)
            VALUES ($1, $2, $3, 'OUT', $4, $5, NOW())
        `, [txOutId, fromId, amount, description || 'Transferencia Saliente', context.userId]);
        
        await client.query(`
            UPDATE financial_accounts SET balance = balance + $1 WHERE id = $2
        `, [amount, toId]);
        
        const txInId = uuidv4();
        await client.query(`
            INSERT INTO treasury_transactions (id, account_id, amount, type, description, created_by, created_at)
            VALUES ($1, $2, $3, 'IN', $4, $5, NOW())
        `, [txInId, toId, amount, description || 'Transferencia Entrante', context.userId]);
        
        // Auditoría
        await client.query(`
            INSERT INTO audit_log (id, user_id, action_code, entity_type, entity_id, new_values, ip_address, created_at)
            VALUES ($1, $2, 'TREASURY_TRANSFER', 'FINANCIAL_ACCOUNT', $3, $4, $5, NOW())
        `, [
            uuidv4(), 
            context.userId, 
            fromId,
            JSON.stringify({ from: fromId, to: toId, amount, txOut: txOutId, txIn: txInId }),
            context.ipAddress || 'server'
        ]);
        
        await client.query('COMMIT');
        
        revalidatePath('/finance/treasury');
        return { success: true, transactionId: txOutId };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        
        const errorMap: Record<string, string> = {
            '55P03': 'Cuenta bloqueada por otra operación',
            'SOURCE_NOT_FOUND': 'Cuenta origen no encontrada',
            'DEST_NOT_FOUND': 'Cuenta destino no encontrada',
            'INSUFFICIENT_FUNDS': 'Fondos insuficientes'
        };
        
        const message = errorMap[error.code] || errorMap[error.message] || 'Error procesando transferencia';
        console.error('Transfer error:', error);
        return { success: false, error: message };
        
    } finally {
        client.release();
    }
}
```

---

## 9. CHECKLIST DE CORRECCIÓN

- [ ] Crear archivo `src/actions/treasury-v2.ts`
- [ ] Implementar `depositToBankAtomic()`
- [ ] Implementar `transferFundsAtomic()`
- [ ] Implementar `confirmRemittanceAtomic()`
- [ ] Agregar FOR UPDATE NOWAIT a validaciones
- [ ] Integrar auditLog() en todas las operaciones
- [ ] Agregar validación de UUIDs
- [ ] Agregar verificación de permisos/roles
- [ ] Corregir bug en recordAutoTreasuryEntry
- [ ] Eliminar auto-creación de cuentas
- [ ] Deprecar funciones antiguas
- [ ] Tests unitarios

---

**Próximo archivo a auditar**: `shift-handover.ts` (205 líneas)
