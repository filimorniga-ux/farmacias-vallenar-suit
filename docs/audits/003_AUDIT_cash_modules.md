# AUDITORÍA #003: Módulos de Caja (Cash)
## Pharma-Synapse v3.1 - Análisis de Integridad Financiera

**Fecha**: 2024-12-23
**Archivos Auditados**:
- `src/actions/cash.ts` (164 líneas)
- `src/actions/cash-management.ts` (183 líneas)
- `src/actions/cash-export.ts` (217 líneas)

**Criticidad**: 🔴 ALTA (Manejo directo de dinero)

---

## 1. RESUMEN EJECUTIVO

Los módulos de caja manejan movimientos financieros críticos: aperturas, cierres, gastos, retiros y reportes. Se identificaron **4 problemas CRÍTICOS**, **5 MEDIOS** y **3 BAJOS**.

### Métricas de Riesgo
| Categoría | Nivel | Hallazgos |
|-----------|-------|-----------|
| Integridad de Datos | 🔴 CRÍTICO | Sin transacciones atómicas |
| Auditoría | 🔴 CRÍTICO | Sin registro audit_log |
| Concurrencia | 🟡 MEDIO | Sin bloqueo FOR UPDATE |
| Validación | 🟡 MEDIO | Validaciones incompletas |
| Seguridad | 🟡 MEDIO | Sin verificación de permisos |

---

## 2. HALLAZGOS DETALLADOS

### 2.1 CRÍTICO: Sin Transacciones Atómicas en createCashMovement

**Archivo**: `cash.ts:11-56`

```typescript
// PROBLEMA: Operación sin transacción
export async function createCashMovement(movement: Omit<CashMovement, 'id'>) {
    try {
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();
        // ... mapeo de tipos ...
        
        const sql = `
            INSERT INTO cash_movements (...)
            VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))
        `;
        await query(sql, values);  // ❌ Sin BEGIN/COMMIT
        
        revalidatePath('/caja');
        return { success: true, id };
    } catch (error) {
        console.error('❌ Error creating cash movement:', error);
        return { success: false, error: 'Database error' };  // ❌ Sin detalles
    }
}
```

**Riesgo**: 
- Movimientos de caja pueden quedar en estados inconsistentes
- Sin rollback en caso de fallo parcial
- No se vincula a sesión activa (`cash_register_sessions`)

**Corrección Propuesta**:
```typescript
export async function createCashMovementAtomic(
    movement: Omit<CashMovement, 'id'>,
    sessionId: string,
    userId: string,
    justification?: string
) {
    const pool = (await import('@/lib/db')).pool;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // 1. Verificar sesión activa
        const sessionCheck = await client.query(`
            SELECT id, status FROM cash_register_sessions 
            WHERE id = $1 AND status = 'OPEN'
            FOR UPDATE NOWAIT
        `, [sessionId]);
        
        if (sessionCheck.rowCount === 0) {
            throw new Error('NO_ACTIVE_SESSION');
        }
        
        // 2. Insertar movimiento
        const { v4: uuidv4 } = await import('uuid');
        const id = uuidv4();
        
        await client.query(`
            INSERT INTO cash_movements (
                id, session_id, location_id, user_id, type, amount, reason, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [id, sessionId, movement.shift_id, userId, dbType, movement.amount, movement.description]);
        
        // 3. Registrar en audit_log
        await client.query(`
            INSERT INTO audit_log (
                id, user_id, session_id, action_code, entity_type, entity_id,
                new_values, ip_address, created_at
            ) VALUES ($1, $2, $3, 'CASH_MOVEMENT_CREATE', 'CASH_MOVEMENT', $4, $5, $6, NOW())
        `, [uuidv4(), userId, sessionId, id, JSON.stringify(movement), 'server']);
        
        await client.query('COMMIT');
        
        revalidatePath('/caja');
        return { success: true, id };
        
    } catch (error: any) {
        await client.query('ROLLBACK');
        
        if (error.code === '55P03') {
            return { success: false, error: 'Session is locked by another operation' };
        }
        if (error.message === 'NO_ACTIVE_SESSION') {
            return { success: false, error: 'No active session found' };
        }
        
        console.error('❌ Error creating cash movement:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}
```

---

### 2.2 CRÍTICO: Confusión de IDs en cash_movements

**Archivo**: `cash.ts:38-46` y `cash-management.ts:123-132`

```typescript
// cash.ts - INSERT
const values = [
    id,
    isValidUUID(movement.shift_id) ? movement.shift_id : null,  // ❌ location_id recibe shift_id
    isValidUUID(movement.user_id) ? movement.user_id : null,
    dbType,
    movement.amount,
    movement.description,
    movement.timestamp
];

// cash-management.ts - SELECT
const movementsRes = await query(`
    SELECT * FROM cash_movements
    WHERE 
        location_id = $1::uuid -- ❌ COMENTARIO: "location_id holds session_id"
        AND type != 'OPENING'
        AND is_cash = true
`, [session.id]);
```

**Riesgo**:
- **Confusión semántica severa**: El campo `location_id` almacena `session_id` en algunos casos
- Inconsistencia en la interpretación de datos
- Queries futuras fallarán al asumir `location_id` es realmente un ID de ubicación

**Corrección Propuesta**:
1. Migración para agregar columna `session_id` explícita a `cash_movements`
2. Script de corrección de datos existentes
3. Actualizar todas las queries para usar el campo correcto

```sql
-- Migración 007: Corregir schema cash_movements
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS session_id UUID;

-- Agregar FK
ALTER TABLE cash_movements 
ADD CONSTRAINT fk_cash_movements_session 
FOREIGN KEY (session_id) REFERENCES cash_register_sessions(id);

-- Crear índice
CREATE INDEX idx_cash_movements_session ON cash_movements(session_id);
```

---

### 2.3 CRÍTICO: Sin Integración con audit_log

**Archivo**: Todos los archivos

Ninguna de las operaciones de caja registra en `audit_log`:
- `createCashMovement()` - Sin auditoría
- `createExpense()` - Sin auditoría
- `getShiftMetrics()` - Sin auditoría de acceso a datos sensibles

**Impacto**:
- Imposible rastrear quién creó/modificó movimientos
- Sin trazabilidad forense
- Incumplimiento de requisitos fiscales

---

### 2.4 CRÍTICO: getShiftMetrics Sin Verificación de Permisos

**Archivo**: `cash-management.ts:28-177`

```typescript
export async function getShiftMetrics(terminalId: string): Promise<...> {
    // Solo valida formato UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!terminalId || !uuidRegex.test(terminalId)) {
        // ...
    }
    
    // ❌ NO VERIFICA:
    // - ¿El usuario tiene permiso para ver esta terminal?
    // - ¿El usuario está asignado a esta ubicación?
    // - ¿Es el cajero de esta sesión activa?
    
    const sessionRes = await query(`...`, [terminalId]);
    // Retorna datos financieros sin autorización
}
```

**Corrección Propuesta**:
```typescript
export async function getShiftMetrics(
    terminalId: string,
    userId: string,
    userRole: string,
    userLocationId: string
): Promise<...> {
    // ... validación UUID ...
    
    // Verificar autorización
    const isManagerial = ['MANAGER', 'ADMIN', 'QF', 'GERENTE_GENERAL'].includes(userRole);
    
    if (!isManagerial) {
        // Verificar que el usuario es el cajero activo de esa terminal
        const authCheck = await query(`
            SELECT id FROM cash_register_sessions
            WHERE terminal_id = $1::uuid 
            AND cashier_id = $2::uuid 
            AND status = 'OPEN'
        `, [terminalId, userId]);
        
        if (authCheck.rowCount === 0) {
            return { success: false, error: 'UNAUTHORIZED' };
        }
    }
    
    // ... resto de la lógica ...
}
```

---

### 2.5 MEDIO: Auto-creación de Tabla sin Control

**Archivo**: `cash.ts:132-153`

```typescript
} catch (error: any) {
    if (error.code === '42P01') {
        console.warn('⚠️ Cash Movements table missing. Auto-creating...');
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS cash_movements (...)
            `);
            return [];
        } catch (createError) {
            console.error('❌ Failed to create cash_movements table:', createError);
            return [];
        }
    }
    // ...
}
```

**Riesgo**:
- Auto-creación de tablas no debe ocurrir en producción
- Schema puede diferir de migraciones oficiales
- Oculta problemas de configuración

**Corrección**: Eliminar auto-creación, fallar con error claro si tabla no existe.

---

### 2.6 MEDIO: Validación Débil de Inputs

**Archivo**: `cash.ts:17-29`

```typescript
// Mapeo frágil de tipos
let dbType = 'WITHDRAWAL';
const type = movement.type as string;
const reason = movement.reason as string;

if (type === 'IN') {
    if (reason === 'INITIAL_FUND') dbType = 'OPENING';
    else dbType = 'EXTRA_INCOME';
} else { // OUT
    if (reason === 'WITHDRAWAL') dbType = 'WITHDRAWAL';
    // ❌ Sin validación de montos (negativos, decimales excesivos)
    // ❌ Sin límites máximos
    // ❌ Sin validación de type/reason contra enum
}
```

**Corrección con Zod**:
```typescript
import { z } from 'zod';

const CashMovementSchema = z.object({
    type: z.enum(['IN', 'OUT']),
    reason: z.enum(['INITIAL_FUND', 'WITHDRAWAL', 'CHANGE', 'SUPPLIES', 'SERVICES', 'EXTRA_INCOME']),
    amount: z.number()
        .positive('Amount must be positive')
        .max(10000000, 'Amount exceeds maximum allowed'),
    description: z.string().max(500).optional(),
    shift_id: z.string().uuid(),
    user_id: z.string().uuid()
});
```

---

### 2.7 MEDIO: generateCashReport Sin Restricciones Temporales

**Archivo**: `cash-export.ts:18-211`

```typescript
export async function generateCashReport(params: CashExportParams) {
    const { startDate, endDate, ... } = params;
    
    // ❌ Sin validación de rango máximo
    // Un usuario podría solicitar 10 años de datos
    
    const salesRes = await query(salesSql, salesParams);
    // Potencial query de millones de registros
}
```

**Corrección**:
```typescript
// Limitar rango a 90 días máximo
const maxRangeDays = 90;
const diffDays = (endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24);

if (diffDays > maxRangeDays) {
    return { 
        success: false, 
        error: `Date range exceeds maximum of ${maxRangeDays} days` 
    };
}

// Agregar LIMIT a queries
salesSql += ` LIMIT 10000`;
```

---

### 2.8 MEDIO: Casting Inseguro en Respuestas

**Archivo**: `cash-management.ts:175-176`

```typescript
return {
    success: true,
    data: {
        // ...
    } as any // ❌ Temporary cast until interface is updated
};
```

**Riesgo**: TypeScript no puede validar tipos, errores en runtime.

---

### 2.9 BAJO: Función Deprecated No Eliminada

**Archivo**: `cash.ts:161-164`

```typescript
function mapDbTypeToDomain(dbType: string): any {
    // Deprecated by inline map
    return 'OUT';
}
```

---

### 2.10 BAJO: Magic Numbers Sin Constantes

**Archivo**: `cash.ts:90`

```typescript
export async function getCashMovements(terminalId?: string, limit = 50) {
    // ❌ 50 hardcodeado
}
```

---

### 2.11 BAJO: Comentarios CRITICAL FIX Sin Resolver

**Archivo**: `cash-management.ts:123-124`

```typescript
// CRITICAL FIX: The 'location_id' column in cash_movements holds the SHIFT ID...
```

Comentario indica problema conocido pero no resuelto en schema.

---

## 3. MATRIZ DE DEPENDENCIAS

```
cash.ts
├── @/lib/db (query)
├── @/domain/types (CashMovement, Expense)
├── @/lib/utils (isValidUUID)
└── uuid

cash-management.ts
├── @/lib/db (query)
└── (ninguna integración con audit_log)

cash-export.ts
├── exceljs
├── @/lib/db (query)
└── cash-management.ts (ShiftMetricsDetailed)
```

---

## 4. RECOMENDACIONES DE CORRECCIÓN

### Prioridad CRÍTICA (Inmediata)
1. **Crear `cash-v2.ts`** con operaciones atómicas
2. **Migración 007** para corregir schema `cash_movements`
3. **Integrar audit_log** en todas las operaciones

### Prioridad ALTA (Esta semana)
4. Agregar validación con Zod
5. Implementar verificación de permisos
6. Agregar límites temporales a reportes

### Prioridad MEDIA (Próximo sprint)
7. Eliminar auto-creación de tablas
8. Limpiar código deprecated
9. Reemplazar magic numbers con constantes

---

## 5. IMPACTO EN ARQUITECTURA

### Tablas Afectadas
- `cash_movements` - Requiere columna `session_id`
- `audit_log` - Debe recibir registros de operaciones de caja

### Server Actions a Modificar
- `createCashMovement` → `createCashMovementAtomic`
- `createExpense` → `createExpenseAtomic`
- `getShiftMetrics` → Agregar parámetros de autorización

### Componentes Frontend Afectados
- `CashManagementModal.tsx` - Actualizar llamadas
- `ShiftManagementModal.tsx` - Actualizar llamadas

---

## 6. CHECKLIST DE CORRECCIÓN

- [ ] Crear archivo `src/actions/cash-v2.ts`
- [ ] Implementar `createCashMovementAtomic()`
- [ ] Implementar `createExpenseAtomic()`
- [ ] Actualizar `getShiftMetrics()` con autorización
- [ ] Crear migración 007 para schema
- [ ] Agregar validación Zod
- [ ] Integrar `auditLog()` de `audit-v2.ts`
- [ ] Tests unitarios para nuevas funciones
- [ ] Actualizar componentes frontend
- [ ] Deprecar funciones antiguas

---

**Próximo archivo a auditar**: `treasury.ts` (339 líneas)
