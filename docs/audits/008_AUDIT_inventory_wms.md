# AUDITORÍA #008: Módulos de Inventario y WMS
## Pharma-Synapse v3.1 - Análisis de Gestión de Stock

**Fecha**: 2024-12-23
**Archivos Auditados**:
- `src/actions/inventory.ts` (282 líneas)
- `src/actions/wms.ts` (341 líneas)

**Criticidad**: 🟡 MEDIA-ALTA (Control de stock y trazabilidad)

---

## 1. RESUMEN EJECUTIVO

Los módulos de inventario gestionan lotes, movimientos de stock, transferencias entre bodegas y el sistema WMS. Se identificaron **2 problemas CRÍTICOS**, **5 MEDIOS** y **3 BAJOS**.

### Evaluación General

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Transacciones WMS | 🟢 BIEN | `executeStockMovement` y `executeTransfer` usan BEGIN/COMMIT |
| Bloqueo Pesimista | 🟢 BIEN | FOR UPDATE en batches |
| Transacciones Inventory | 🔴 CRÍTICO | `createBatch` sin transacción |
| Auditoría | 🟡 PARCIAL | Solo pérdidas, falta más |
| Validación | 🟡 MEDIO | Validación básica |
| Auto-modificación DDL | 🔴 CRÍTICO | ALTER TABLE en runtime |

---

## 2. HALLAZGOS POSITIVOS ✅

### 2.1 WMS con Transacciones y Bloqueo

```typescript
// wms.ts:38-156
const client = await pool.connect();
try {
    await client.query('BEGIN');
    
    // Bloqueo pesimista en lote
    const batchRes = await client.query(
        `SELECT quantity_real, product_id, sku FROM inventory_batches WHERE id = $1 FOR UPDATE`, 
        [targetBatchId]
    );
    
    // Validación de stock negativo
    if (newQty < 0) {
        throw new Error(`Insufficient stock for movement`);
    }
    
    // ...
    await client.query('COMMIT');
} catch (e) {
    await client.query('ROLLBACK');
}
```

### 2.2 Transferencias Atómicas

```typescript
// wms.ts:168-276
export async function executeTransfer(params: TransferParams) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        for (const item of items) {
            // Lock origen
            const originBatchRes = await client.query(
                `SELECT * FROM inventory_batches WHERE id = $1 AND warehouse_id = $2 FOR UPDATE`,
                [item.lotId, originWarehouseId]
            );
            
            // Validación de stock
            if (batch.quantity_real < item.quantity) {
                throw new Error(`Insufficient stock`);
            }
            
            // Decrementar origen, incrementar/crear destino
            // ...
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
    }
}
```

### 2.3 Auditoría de Pérdidas

```typescript
// wms.ts:137-147
if (type === 'ADJUSTMENT' && delta < 0) {
    await logAuditAction(userId, 'STOCK_LOSS', {
        type,
        product: productName,
        sku: productSku,
        qty: Math.abs(delta),
        reason: reason,
        location: warehouseId
    });
}
```

---

## 3. HALLAZGOS CRÍTICOS

### 3.1 CRÍTICO: createBatch Sin Transacción

**Archivo**: `inventory.ts:7-106`

```typescript
export async function createBatch(batchData: Partial<InventoryBatch> & { userId: string }) {
    try {
        // ❌ Sin BEGIN/COMMIT
        
        // Query 1: Resolver warehouse
        const locRes = await query('SELECT default_warehouse_id FROM locations WHERE id = $1', [...]);
        
        // Query 2: Insertar batch
        const insertRes = await query(`INSERT INTO inventory_batches (...)`);
        
        // Query 3: Log movimiento
        await query(`INSERT INTO stock_movements (...)`);
        
        // ❌ Si falla Query 3, el batch existe sin su movimiento de inicio
    }
}
```

**Riesgo**:
- Batch creado pero sin movimiento de stock registrado
- Inconsistencia entre `inventory_batches` y `stock_movements`
- Datos huérfanos en caso de fallo parcial

**Corrección**:
```typescript
export async function createBatchAtomic(
    batchData: Partial<InventoryBatch> & { userId: string }
): Promise<{ success: boolean; batchId?: string; error?: string }> {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // Validación
        if (!batchData.sku || !batchData.location_id) {
            throw new Error('SKU and Location are required');
        }
        
        // 1. Resolver warehouse
        let targetWarehouseId = batchData.warehouse_id || batchData.location_id;
        
        if (!batchData.warehouse_id) {
            const locRes = await client.query(
                'SELECT default_warehouse_id FROM locations WHERE id = $1',
                [batchData.location_id]
            );
            if (locRes.rows.length > 0 && locRes.rows[0].default_warehouse_id) {
                targetWarehouseId = locRes.rows[0].default_warehouse_id;
            }
        }
        
        // 2. Insertar batch
        const insertRes = await client.query(`
            INSERT INTO inventory_batches (...)
            RETURNING id
        `, [...]);
        
        const newBatchId = insertRes.rows[0].id;
        
        // 3. Log movimiento inicial
        await client.query(`
            INSERT INTO stock_movements (...)
        `, [...]);
        
        // 4. Auditoría
        await client.query(`
            INSERT INTO audit_log (...)
        `, [...]);
        
        await client.query('COMMIT');
        
        revalidatePath('/inventory');
        return { success: true, batchId: newBatchId };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Failed to create batch:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}
```

---

### 3.2 CRÍTICO: Auto-modificación DDL en Runtime

**Archivo**: `inventory.ts:96-103`

```typescript
if (error.code === '42703') { // Undefined column
    // ❌ PELIGROSO: ALTER TABLE en producción
    await query(`ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS stock_min INTEGER DEFAULT 0;`);
    await query(`ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS stock_max INTEGER DEFAULT 0;`);
    return { success: false, error: 'Database schema updated. Please try again.' };
}
```

**Riesgos GRAVES**:
1. **DDL en producción** puede bloquear tablas
2. **Sin transacción** - cambios parciales posibles
3. **Oculta errores de configuración** - schema debería ser correcto antes de deploy
4. **No es idempotente** - puede ejecutarse múltiples veces

**Corrección**: Eliminar auto-DDL, usar migraciones:
```typescript
if (error.code === '42703') {
    console.error('Schema error: Missing column. Run migrations before deploying.');
    return { 
        success: false, 
        error: 'Error de configuración del sistema. Contacte soporte.' 
    };
}
```

---

## 4. HALLAZGOS MEDIOS

### 4.1 MEDIO: SQL Injection en getRecentMovements

**Archivo**: `inventory.ts:140`

```typescript
const sql = `
    SELECT ...
    FROM stock_movements sm
    ...
    LIMIT ${limit}  // ❌ Interpolación directa
`;
```

**Corrección**:
```typescript
const validLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
const sql = `
    SELECT ...
    LIMIT $${params.length + 1}
`;
params.push(validLimit);
```

---

### 4.2 MEDIO: clearLocationInventory Sin Transacción ni Auditoría Completa

**Archivo**: `inventory.ts:248-282`

```typescript
export async function clearLocationInventory(locationId: string, userId: string) {
    // Verificación de rol ✅
    
    // ❌ DELETE masivo sin transacción
    const result = await query(`
        DELETE FROM inventory_batches 
        WHERE location_id = $1
    `, [locationId]);
    
    // ❌ Sin registro en audit_log de lo eliminado
    // ❌ Sin registro en stock_movements
}
```

**Corrección**:
```typescript
export async function clearLocationInventoryAtomic(
    locationId: string, 
    userId: string,
    justification: string
): Promise<...> {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Verificar permisos
        const userRes = await client.query(`SELECT role FROM users WHERE id = $1`, [userId]);
        if (!['ADMIN', 'MANAGER'].includes(userRes.rows[0]?.role)) {
            throw new Error('UNAUTHORIZED');
        }
        
        // Obtener items a eliminar para auditoría
        const itemsRes = await client.query(`
            SELECT id, sku, name, quantity_real 
            FROM inventory_batches 
            WHERE location_id = $1
        `, [locationId]);
        
        const deletedItems = itemsRes.rows;
        
        // Crear movimientos de salida para cada item
        for (const item of deletedItems) {
            await client.query(`
                INSERT INTO stock_movements (
                    id, sku, product_name, location_id, movement_type,
                    quantity, stock_before, stock_after, user_id, notes, batch_id
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3, 'NUCLEAR_DELETE',
                    $4, $4, 0, $5, $6, $7
                )
            `, [
                item.sku, item.name, locationId,
                -item.quantity_real, userId, justification, item.id
            ]);
        }
        
        // Eliminar batches
        const result = await client.query(`
            DELETE FROM inventory_batches WHERE location_id = $1
        `, [locationId]);
        
        // Auditoría
        await client.query(`
            INSERT INTO audit_log (
                id, user_id, action_code, entity_type, entity_id,
                old_values, justification, created_at
            ) VALUES (
                gen_random_uuid(), $1, 'INVENTORY_NUCLEAR_DELETE', 'LOCATION', $2,
                $3, $4, NOW()
            )
        `, [
            userId, locationId,
            JSON.stringify({ deleted_count: result.rowCount, items: deletedItems }),
            justification
        ]);
        
        await client.query('COMMIT');
        
        return { success: true, message: `Se eliminaron ${result.rowCount} registros` };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}
```

---

### 4.3 MEDIO: Falta FOR UPDATE NOWAIT

**Archivo**: `wms.ts:102`

```typescript
const batchRes = await client.query(
    `SELECT quantity_real, product_id, sku FROM inventory_batches WHERE id = $1 FOR UPDATE`,
    [targetBatchId]
);
// ❌ Sin NOWAIT - puede esperar indefinidamente
```

**Corrección**:
```typescript
const batchRes = await client.query(
    `SELECT quantity_real, product_id, sku FROM inventory_batches WHERE id = $1 FOR UPDATE NOWAIT`,
    [targetBatchId]
);

// En catch:
if (error.code === '55P03') {
    return { success: false, error: 'Batch bloqueado por otra operación' };
}
```

---

### 4.4 MEDIO: uuid_generate_v4() vs gen_random_uuid()

**Archivo**: `wms.ts:127`

```typescript
INSERT INTO stock_movements (...) VALUES (uuid_generate_v4(), ...)
```

`uuid_generate_v4()` requiere extensión `uuid-ossp`, mientras que `gen_random_uuid()` es nativo de PostgreSQL 13+.

**Inconsistencia**: Algunas partes usan `gen_random_uuid()`, otras `uuid_generate_v4()`.

---

### 4.5 MEDIO: Validación Incompleta de Inputs

**Archivo**: `wms.ts:32-33`

```typescript
export async function executeStockMovement(params: StockMovementParams) {
    const { productId, warehouseId, quantity, type, reason, userId, batchId } = params;
    // ❌ Sin validación de UUIDs
    // ❌ Sin validación de quantity > 0
    // ❌ Sin validación de type contra enum
}
```

**Corrección con Zod**:
```typescript
const StockMovementSchema = z.object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    quantity: z.number().positive(),
    type: z.enum(['ADJUSTMENT', 'LOSS', 'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'RECEIPT']),
    reason: z.string().min(5).max(500),
    userId: z.string().uuid(),
    batchId: z.string().uuid().optional()
});
```

---

## 5. HALLAZGOS BAJOS

### 5.1 BAJO: Console.log en Producción

```typescript
// inventory.ts:8
console.log('📦 [Server Action] Creating New Batch', batchData);

// inventory.ts:171
console.log(`📦 [Server Action] Fetching Inventory for Location: ${locationId}`);
```

Deberían usar un logger configurable.

---

### 5.2 BAJO: Silent Fail en getPurchaseOrders

```typescript
// wms.ts:337-340
catch (error) {
    // Silent fail if table missing
    return [];
}
```

Oculta errores de configuración.

---

### 5.3 BAJO: Comentarios de Desarrollo

```typescript
// wms.ts:67-98 - Comentarios extensos sobre lógica de delta
// Let's assume...
// Usually...
// For simplicity...
```

Deberían ser documentación formal o eliminarse.

---

## 6. MATRIZ DE TRAZABILIDAD DE STOCK

| Operación | Tabla Afectada | stock_movements | audit_log |
|-----------|----------------|-----------------|-----------|
| createBatch | inventory_batches | ✅ | ❌ |
| executeStockMovement | inventory_batches | ✅ | 🟡 Solo pérdidas |
| executeTransfer | inventory_batches | ✅ | ❌ |
| clearLocationInventory | inventory_batches | ❌ | ❌ |
| getInventory | N/A (read) | - | - |

**Problema**: Falta trazabilidad completa en audit_log.

---

## 7. MODELO DE DATOS

```
inventory_batches
├── id (UUID, PK)
├── product_id (UUID, FK -> products)
├── location_id (UUID, FK -> locations)
├── warehouse_id (UUID, FK -> warehouses)
├── sku (VARCHAR)
├── name (VARCHAR)
├── quantity_real (INTEGER)
├── lot_number (VARCHAR)
├── expiry_date (TIMESTAMP)
├── unit_cost (NUMERIC)
├── sale_price (NUMERIC)
├── stock_min (INTEGER)
└── stock_max (INTEGER)

stock_movements
├── id (UUID, PK)
├── batch_id (UUID, FK -> inventory_batches)
├── sku (VARCHAR) -- Desnormalizado
├── product_name (VARCHAR) -- Desnormalizado
├── location_id (UUID)
├── movement_type (VARCHAR)
├── quantity (INTEGER) -- Delta
├── stock_before (INTEGER)
├── stock_after (INTEGER)
├── timestamp (TIMESTAMP)
├── user_id (UUID)
├── notes (TEXT)
└── reference_type (VARCHAR)
```

---

## 8. RECOMENDACIONES DE CORRECCIÓN

### Prioridad CRÍTICA (Inmediata)
1. **Agregar transacción a createBatch**
2. **Eliminar auto-DDL** (ALTER TABLE en runtime)
3. **Agregar NOWAIT** a FOR UPDATE

### Prioridad ALTA (Esta semana)
4. Agregar transacción y auditoría a `clearLocationInventory`
5. Parametrizar LIMIT en queries
6. Unificar UUID generation (gen_random_uuid)

### Prioridad MEDIA (Próximo sprint)
7. Agregar validación Zod
8. Extender auditoría a todas las operaciones
9. Reemplazar console.log con logger

---

## 9. CÓDIGO CORREGIDO PROPUESTO

### inventory-v2.ts (Extracto)

```typescript
'use server';

import { pool, query } from '@/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auditLog } from '@/lib/audit-v2';

const BatchSchema = z.object({
    sku: z.string().min(1),
    name: z.string().min(1),
    location_id: z.string().uuid(),
    warehouse_id: z.string().uuid().optional(),
    product_id: z.string().uuid().optional(),
    stock_actual: z.number().nonnegative().default(0),
    expiry_date: z.number().optional(),
    cost_net: z.number().nonnegative().default(0),
    price: z.number().nonnegative().default(0),
    stock_min: z.number().nonnegative().default(0),
    stock_max: z.number().nonnegative().default(1000),
    userId: z.string().uuid()
});

export async function createBatchAtomic(
    batchData: z.infer<typeof BatchSchema>
): Promise<{ success: boolean; batchId?: string; error?: string }> {
    // Validación
    const validated = BatchSchema.safeParse(batchData);
    if (!validated.success) {
        return { success: false, error: validated.error.message };
    }
    
    const data = validated.data;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // 1. Resolver warehouse
        let targetWarehouseId = data.warehouse_id || data.location_id;
        
        if (!data.warehouse_id) {
            const locRes = await client.query(
                'SELECT default_warehouse_id FROM locations WHERE id = $1',
                [data.location_id]
            );
            if (locRes.rows[0]?.default_warehouse_id) {
                targetWarehouseId = locRes.rows[0].default_warehouse_id;
            }
        }
        
        // 2. Insertar batch
        const lotNumber = `LOT-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        
        const insertRes = await client.query(`
            INSERT INTO inventory_batches (
                id, product_id, sku, name, 
                location_id, warehouse_id,
                quantity_real, expiry_date, lot_number,
                unit_cost, sale_price,
                stock_min, stock_max
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, 
                $4, $5,
                $6, to_timestamp($7 / 1000.0), $8,
                $9, $10,
                $11, $12
            )
            RETURNING id
        `, [
            data.product_id,
            data.sku,
            data.name,
            data.location_id,
            targetWarehouseId,
            data.stock_actual,
            data.expiry_date,
            lotNumber,
            data.cost_net,
            data.price,
            data.stock_min,
            data.stock_max
        ]);
        
        const newBatchId = insertRes.rows[0].id;
        
        // 3. Log movimiento inicial
        await client.query(`
            INSERT INTO stock_movements (
                id, sku, product_name, location_id, movement_type, 
                quantity, stock_before, stock_after, 
                timestamp, user_id, notes, batch_id, reference_type
            ) VALUES (
                gen_random_uuid(), $1, $2, $3, 'RECEIPT', 
                $4, 0, $4, 
                NOW(), $5, 'Initial Batch Creation', $6, 'INITIAL'
            )
        `, [
            data.sku,
            data.name,
            targetWarehouseId,
            data.stock_actual,
            data.userId,
            newBatchId
        ]);
        
        // 4. Auditoría
        await client.query(`
            INSERT INTO audit_log (
                id, user_id, action_code, entity_type, entity_id,
                new_values, created_at
            ) VALUES (
                gen_random_uuid(), $1, 'BATCH_CREATE', 'INVENTORY_BATCH', $2,
                $3, NOW()
            )
        `, [
            data.userId,
            newBatchId,
            JSON.stringify({
                sku: data.sku,
                name: data.name,
                quantity: data.stock_actual,
                location_id: data.location_id,
                warehouse_id: targetWarehouseId
            })
        ]);
        
        await client.query('COMMIT');
        
        revalidatePath('/inventory');
        return { success: true, batchId: newBatchId };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Failed to create batch:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}
```

---

## 10. CHECKLIST DE CORRECCIÓN

### Crítico
- [ ] Agregar transacción a `createBatch`
- [ ] Eliminar auto-DDL (ALTER TABLE)
- [ ] Agregar NOWAIT a FOR UPDATE

### Alto
- [ ] Agregar transacción a `clearLocationInventory`
- [ ] Agregar auditoría completa a operaciones
- [ ] Parametrizar LIMIT en queries

### Medio
- [ ] Agregar validación Zod
- [ ] Unificar UUID generation
- [ ] Reemplazar console.log con logger
- [ ] Documentar modelo de datos

---

**Próximo archivo a auditar**: `POSMainScreen.tsx` (Componente Frontend)
