# 🔬 AUDITORÍA #002: sales.ts
## Pharma-Synapse v3.1 - Módulo de Ventas
### Fecha: 2024-12-23 | Auditor: Sistema

---

## 📊 MÉTRICAS

| Métrica | Valor |
|---------|-------|
| **Líneas** | 273 |
| **Funciones exportadas** | 2 |
| **Funciones internas** | 2 |
| **Complejidad** | 🟡 MEDIA |

---

## ✅ FORTALEZAS IDENTIFICADAS

### 1. **USA TRANSACCIONES REALES** ✅
```typescript
await client.query('BEGIN');
// ... operaciones ...
await client.query('COMMIT');
// En caso de error:
await client.query('ROLLBACK');
```

### 2. **DESCUENTO ATÓMICO DE INVENTARIO** ✅
```typescript
await client.query(
    `UPDATE inventory_batches 
     SET quantity_real = quantity_real - $1 
     WHERE id = $2
     RETURNING quantity_real`,
    [item.quantity, item.batch_id]
);
```

### 3. **VALIDACIÓN DE UUID** ✅
```typescript
const userId = isValidUUID(saleData.seller_id) ? saleData.seller_id : null;
isValidUUID(item.batch_id) ? item.batch_id : null
```

### 4. **MANEJO DE ERRORES DE SCHEMA** ✅
```typescript
const isSchemaError = error.code === '42P01' || error.code === '42703';
if (isSchemaError) {
    // Auto-repair schema
}
```

### 5. **GENERACIÓN DE UUID PARA VENTA** ✅
```typescript
const saleId = uuidv4();
```

---

## 🔴 VULNERABILIDADES CRÍTICAS

### 1. **SIN BLOQUEO PESIMISTA EN INVENTARIO** (Severidad: 🔴 CRÍTICA)

**Ubicación:** Líneas 70-81

```typescript
// ❌ CÓDIGO ACTUAL - Sin FOR UPDATE
const stockRes = await client.query(
    `UPDATE inventory_batches 
     SET quantity_real = quantity_real - $1 
     WHERE id = $2
     RETURNING quantity_real`,
    [item.quantity, item.batch_id]
);
```

**Problema:**
- Dos ventas simultáneas del mismo lote pueden causar stock negativo
- No hay verificación de stock disponible ANTES de decrementar
- Race condition: `quantity_real = 10`, dos ventas de 8 unidades simultáneas → resultado: -6

**Impacto:** 
- Stock negativo en base de datos
- Sobreventa de productos
- Descuadres de inventario

---

### 2. **NO REGISTRA EN AUDIT_LOG** (Severidad: 🔴 CRÍTICA)

**Ubicación:** Todo el archivo

```typescript
// ❌ FALTA: Registro de auditoría
// Ventas son CRÍTICAS para el SII y deben ser rastreables
```

**Problema:**
- Las ventas no quedan registradas en el sistema de auditoría
- Incumplimiento fiscal (SII Chile requiere trazabilidad)
- No hay registro de quién, cuándo, qué se vendió para auditoría forense

---

### 3. **NO VERIFICA STOCK ANTES DE VENDER** (Severidad: 🔴 CRÍTICA)

**Ubicación:** Líneas 69-81

```typescript
// ❌ CÓDIGO ACTUAL - Decrementa sin verificar
if (isValidUUID(item.batch_id)) {
    await client.query(
        `UPDATE inventory_batches 
         SET quantity_real = quantity_real - $1 
         WHERE id = $2`,
        [item.quantity, item.batch_id]
    );
}
// ⚠️ Comentario dice "Optional: Check if negative?" pero NO LO HACE
```

**Problema:**
- Permite vender más de lo que hay en stock
- No hay constraint CHECK en la tabla
- Stock puede quedar en valores negativos

---

### 4. **NO USA NIVEL DE AISLAMIENTO ADECUADO** (Severidad: 🟡 MEDIA)

**Ubicación:** Línea 29

```typescript
// ❌ CÓDIGO ACTUAL - Solo BEGIN sin nivel de aislamiento
await client.query('BEGIN');

// ✅ DEBERÍA SER
await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
// O al menos READ COMMITTED con FOR UPDATE
```

---

### 5. **CONSOLE.LOG EN PRODUCCIÓN** (Severidad: 🟢 BAJA)

**Ubicación:** Múltiples

```typescript
console.log(`🛒 [Server Action] Creating Sale...`);
console.error('❌ Transaction Failed -> Rollback executed.');
console.warn(`⚠️ Detected Schema Issue...`);
```

**Problema:**
- Expone información en logs de producción
- Debería usar logger estructurado

---

### 6. **NO VINCULA VENTA CON SESIÓN DE CAJA** (Severidad: 🟡 MEDIA)

**Ubicación:** Líneas 38-52

```typescript
// ❌ FALTA: session_id / shift_id
await client.query(
    `INSERT INTO sales (id, location_id, terminal_id, user_id, ...)`,
    // No incluye session_id
);
```

**Problema:**
- No se puede vincular la venta con el turno/sesión de caja
- Dificulta la conciliación de arqueos
- Reportes de turno incompletos

---

### 7. **RETRY LOGIC INCOMPLETA** (Severidad: 🟢 BAJA)

**Ubicación:** Líneas 134-145

```typescript
async function createSale_RetryAfterRepair(saleData: SaleTransaction) {
    // Solo retorna error, NO reintenta realmente
    return { success: false, error: 'Schema repaired. Please try processing sale again.' };
}
```

**Problema:**
- La función dice que reintenta pero no lo hace
- Usuario debe hacer clic de nuevo manualmente

---

## 📋 MATRIZ DE RIESGOS

| Vulnerabilidad | Severidad | Probabilidad | Impacto |
|----------------|-----------|--------------|---------|
| Sin bloqueo inventario | 🔴 CRÍTICA | Alta | Sobreventa |
| Sin audit_log | 🔴 CRÍTICA | 100% | Incumplimiento SII |
| Stock negativo permitido | 🔴 CRÍTICA | Media | Descuadres |
| Sin SERIALIZABLE | 🟡 MEDIA | Media | Race conditions |
| Sin session_id | 🟡 MEDIA | 100% | Conciliación difícil |
| Console.log | 🟢 BAJA | 100% | Info leak |

---

## 🛠️ CORRECCIONES PROPUESTAS

### PRIORIDAD 1: Bloqueo Pesimista + Verificación de Stock

```typescript
// Antes de decrementar, verificar y bloquear
const stockCheck = await client.query(`
    SELECT id, quantity_real 
    FROM inventory_batches 
    WHERE id = $1 
    FOR UPDATE NOWAIT
`, [item.batch_id]);

if (stockCheck.rows.length === 0) {
    throw new Error(`Lote ${item.batch_id} no encontrado`);
}

const currentStock = Number(stockCheck.rows[0].quantity_real);
if (currentStock < item.quantity) {
    throw new Error(`Stock insuficiente para ${item.name}. Disponible: ${currentStock}, Solicitado: ${item.quantity}`);
}

// Ahora sí decrementar (ya tenemos el lock)
await client.query(`
    UPDATE inventory_batches 
    SET quantity_real = quantity_real - $1,
        updated_at = NOW()
    WHERE id = $2
`, [item.quantity, item.batch_id]);
```

### PRIORIDAD 2: Agregar Registro de Auditoría

```typescript
// Después del COMMIT, registrar auditoría
await client.query(`
    INSERT INTO audit_log (
        user_id, terminal_id, location_id,
        action_code, entity_type, entity_id,
        new_values, metadata
    ) VALUES (
        $1::uuid, $2::uuid, $3::uuid,
        'SALE_CREATE', 'SALE', $4::uuid,
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
```

### PRIORIDAD 3: Agregar session_id

```typescript
// En el INSERT de sales, agregar columna session_id
await client.query(
    `INSERT INTO sales (
        id, location_id, terminal_id, session_id, user_id, 
        customer_rut, total_amount, payment_method, dte_folio, timestamp
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0))`,
    [
        saleId,
        saleData.branch_id,
        saleData.terminal_id,
        saleData.session_id, // NUEVO
        userId,
        saleData.customer?.rut || null,
        saleData.total,
        saleData.payment_method,
        saleData.dte_folio || null,
        saleData.timestamp
    ]
);
```

### PRIORIDAD 4: Usar SERIALIZABLE

```typescript
// Cambiar línea 29
await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
```

### PRIORIDAD 5: Reemplazar console.log con logger

```typescript
import { logger } from '@/lib/logger';

// Reemplazar:
console.log(`🛒 Creating Sale...`);
// Por:
logger.info({ saleId, terminalId: saleData.terminal_id }, 'Creating sale');
```

---

## 📝 CÓDIGO CORREGIDO COMPLETO

```typescript
'use server';

import { query } from '@/lib/db';
import { SaleTransaction, SaleItem } from '../domain/types';
import { revalidatePath } from 'next/cache';
import { isValidUUID } from '@/lib/utils';
import { logger } from '@/lib/logger';

/**
 * Crea una venta de forma atómica con:
 * - Bloqueo pesimista de inventario
 * - Verificación de stock
 * - Registro de auditoría
 * - Vinculación con sesión de caja
 */
export async function createSale(saleData: SaleTransaction & { session_id?: string }) {
    const { pool } = await import('@/lib/db');
    const { v4: uuidv4 } = await import('uuid');

    const saleId = uuidv4();
    const client = await pool.connect();

    try {
        logger.info({ saleId, terminalId: saleData.terminal_id }, 'Starting sale transaction');

        // TRANSACCIÓN SERIALIZABLE
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // Validaciones
        if (!saleData.branch_id) throw new Error('Missing branch_id');
        if (!saleData.terminal_id) throw new Error('Missing terminal_id');
        if (!saleData.items || saleData.items.length === 0) throw new Error('No items in sale');

        const userId = isValidUUID(saleData.seller_id) ? saleData.seller_id : null;

        // 1. VERIFICAR Y BLOQUEAR STOCK DE CADA ITEM
        for (const item of saleData.items) {
            if (!isValidUUID(item.batch_id)) continue;

            const stockCheck = await client.query(`
                SELECT id, quantity_real, product_id
                FROM inventory_batches 
                WHERE id = $1 
                FOR UPDATE NOWAIT
            `, [item.batch_id]);

            if (stockCheck.rows.length === 0) {
                throw new Error(`Lote ${item.batch_id} no encontrado`);
            }

            const currentStock = Number(stockCheck.rows[0].quantity_real);
            if (currentStock < item.quantity) {
                throw new Error(`Stock insuficiente. Disponible: ${currentStock}, Solicitado: ${item.quantity}`);
            }
        }

        // 2. INSERTAR CABECERA DE VENTA
        await client.query(`
            INSERT INTO sales (
                id, location_id, terminal_id, session_id, user_id,
                customer_rut, total_amount, payment_method, dte_folio, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0))
        `, [
            saleId,
            saleData.branch_id,
            saleData.terminal_id,
            saleData.session_id || null,
            userId,
            saleData.customer?.rut || null,
            saleData.total,
            saleData.payment_method,
            saleData.dte_folio || null,
            saleData.timestamp
        ]);

        // 3. INSERTAR ITEMS Y DECREMENTAR STOCK
        for (const item of saleData.items) {
            await client.query(`
                INSERT INTO sale_items (sale_id, batch_id, quantity, unit_price, total_price)
                VALUES ($1, $2, $3, $4, $5)
            `, [saleId, isValidUUID(item.batch_id) ? item.batch_id : null, item.quantity, item.price, item.price * item.quantity]);

            if (isValidUUID(item.batch_id)) {
                await client.query(`
                    UPDATE inventory_batches 
                    SET quantity_real = quantity_real - $1, updated_at = NOW()
                    WHERE id = $2
                `, [item.quantity, item.batch_id]);
            }
        }

        // 4. REGISTRAR AUDITORÍA
        await client.query(`
            INSERT INTO audit_log (
                user_id, terminal_id, location_id, session_id,
                action_code, entity_type, entity_id, new_values
            ) VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                'SALE_CREATE', 'SALE', $5::uuid, $6::jsonb
            )
        `, [
            userId,
            saleData.terminal_id,
            saleData.branch_id,
            saleData.session_id || null,
            saleId,
            JSON.stringify({
                total: saleData.total,
                payment_method: saleData.payment_method,
                items_count: saleData.items.length,
                customer_rut: saleData.customer?.rut || null
            })
        ]);

        await client.query('COMMIT');
        logger.info({ saleId }, 'Sale completed successfully');

        revalidatePath('/caja');
        revalidatePath('/pos');

        return { success: true, transactionId: saleId };

    } catch (error: any) {
        await client.query('ROLLBACK');
        
        if (error.code === '55P03') {
            logger.warn({ saleId }, 'Inventory locked by another process');
            return { success: false, error: 'Producto bloqueado por otra venta. Reintente.' };
        }

        logger.error({ err: error, saleId }, 'Sale transaction failed');
        return { success: false, error: error.message };

    } finally {
        client.release();
    }
}
```

---

## ✅ CHECKLIST DE CORRECCIONES

- [ ] Agregar `FOR UPDATE NOWAIT` en verificación de stock
- [ ] Verificar stock >= cantidad ANTES de decrementar
- [ ] Cambiar a `ISOLATION LEVEL SERIALIZABLE`
- [ ] Agregar INSERT en `audit_log` con action_code 'SALE_CREATE'
- [ ] Agregar columna `session_id` al INSERT de sales
- [ ] Reemplazar `console.log` por `logger`
- [ ] Manejar error `55P03` (lock not available)
- [ ] Agregar migración para columna `session_id` en tabla `sales` si no existe

---

## 📊 RESUMEN

| Severidad | Cantidad |
|-----------|----------|
| 🔴 CRÍTICA | 3 |
| 🟡 MEDIA | 2 |
| 🟢 BAJA | 2 |

**Riesgo Principal:** Sobreventa por falta de bloqueo en inventario + incumplimiento fiscal por falta de auditoría.

---

*Auditoría #002 completada*
*Siguiente: cash.ts y cash-management.ts*
