# Tech Debt & Mejoras Pendientes - WMS / Handover

**Fecha de Creación:** 2026-01-26  
**Prioridad:** Media-Alta (Pre-Producción)  
**Módulos Afectados:** WMS-v2, Shift-Handover-v2, Notifications-v2

---

## 1. Cobertura de Tests WMS

### Estado Actual
- `tests/actions/wms-v2.test.ts` está marcado como `describe.skip`
- El schema `StockMovementSchema` requiere campos que no fueron mapeados correctamente en los tests iniciales

### Acciones Requeridas
- [ ] Revisar `StockMovementSchema` y documentar campos requeridos vs opcionales
- [ ] Validar `executeStockMovementSecure` con:
  - Campos de batch: `lot_number`, `expiry_date`, `unit_cost`
  - Tolerancia de stock negativo (actualmente permitido con warning)
  - Movimientos tipo `LOSS`, `RETURN`, `ADJUSTMENT`, `TRANSFER_*`
- [ ] Crear factories de datos para generar batches válidos en tests

---

## 2. Seeds y Fixtures de Datos

### Problema
Las rutas WMS y Handover asumen que existen:
- `warehouses` poblados
- `terminals` configurados
- `cash_register_sessions` activas
- `users` con `access_pin_hash` válido

Sin datos seed, los tests de integración fallan silenciosamente.

### Acciones Requeridas
- [ ] Crear `tests/fixtures/` con:
  - `seed-users.ts` (usuarios con PIN hasheado)
  - `seed-terminals.ts` (terminales y warehouses)
  - `seed-inventory.ts` (productos y batches mínimos)
- [ ] Documentar cómo ejecutar seeds antes de tests de integración

---

## 3. Concurrencia y Bloqueos (FOR UPDATE NOWAIT)

### Problema
- `shift-handover-v2.ts` y `wms-v2.ts` usan `FOR UPDATE NOWAIT`
- Error `55P03` (lock not available) se devuelve al usuario sin reintentos
- No hay telemetría para medir frecuencia de conflictos

### Acciones Requeridas
- [ ] Implementar retry con backoff exponencial (max 3 intentos, delay 100ms, 500ms, 2s)
- [ ] Añadir logging estructurado para eventos `55P03` (métricas de contención)
- [ ] Definir UX en frontend: mostrar "Operación en uso, reintentando..." vs "Intente de nuevo"
- [ ] Considerar `FOR UPDATE SKIP LOCKED` para operaciones menos críticas

---

## 4. Roles y Validación de PIN

### Estado Actual
- Handover permite override a `ADMIN`, `MANAGER`, `GERENTE_GENERAL`
- Fallback a PIN plano si no hay hash (se loguea warning)

### Riesgos
- En producción, usuarios privilegiados sin PIN hash podrían usar credenciales débiles
- El warning solo aparece en logs, no hay alerta activa

### Acciones Requeridas
- [ ] Migración para asegurar que todos los usuarios con rol elevado tengan `access_pin_hash` no nulo
- [ ] Bloquear login con PIN plano en producción (solo permitir en dev)
- [ ] Crear notificación administrativa si se detecta usuario sin hash

---

## 5. Notificaciones WMS (Stock Crítico)

### Estado Actual
- `sales-v2.ts` tiene trigger de notificación cuando stock ≤ 0 post-venta
- `wms-v2.ts` no tiene trigger equivalente para movimientos manuales (`LOSS`, `ADJUSTMENT`)

### Acciones Requeridas
- [ ] Replicar lógica de notificación en `executeStockMovementSecure`:
  ```typescript
  if (newStock <= 0) {
    await createNotificationSecure({
      type: 'STOCK_CRITICAL',
      severity: 'ERROR',
      title: 'Stock Crítico por Movimiento WMS',
      message: `...`,
      metadata: { batchId, movementType, userId }
    });
  }
  ```
- [ ] Unificar en helper `checkAndNotifyLowStock(batchId, newStock, context)`

---

## 6. Documentación de Entorno de Tests

### Estado Actual
- `vitest.config.ts` define `DATABASE_URL` mock para tests unitarios
- Tests de integración se saltan sin `POSTGRES_URL`

### Acciones Requeridas
- [x] Añadir sección en README sobre cómo ejecutar tests (ver abajo)
- [ ] Crear script `npm run test:integration` que requiera `.env.test`

---

## Referencias

- `src/actions/wms-v2.ts` - Líneas 215-377 (`executeStockMovementSecure`)
- `src/actions/shift-handover-v2.ts` - Líneas 80-250 (`executeHandoverSecure`)
- `src/actions/sales-v2.ts` - Líneas 601-638 (Notification Trigger)
- `vitest.config.ts` - Configuración de entorno

