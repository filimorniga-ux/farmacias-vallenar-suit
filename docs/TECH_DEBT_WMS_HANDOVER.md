# Tech Debt & Mejoras Pendientes - WMS / Handover

**Fecha de Creación:** 2026-01-26  
**Prioridad:** Media-Alta (Pre-Producción)  
**Módulos Afectados:** WMS-v2, Shift-Handover-v2, Notifications-v2

---

## 1. Cobertura de Tests WMS

### Estado Actual
- ~~`tests/actions/wms-v2.test.ts` está marcado como `describe.skip`~~
- ~~El schema `StockMovementSchema` requiere campos que no fueron mapeados correctamente~~

### Acciones Requeridas
- [x] Crear tests de validación de entrada (11 tests pasando)
- [x] Validar rechazo de UUIDs inválidos, razones cortas, cantidades negativas
- [x] Test de error 55P03 (lock contention)
- [x] Test de getStockHistorySecure con paginación
- [ ] Tests de integración con DB real (requiere POSTGRES_URL)

---

## 2. Seeds y Fixtures de Datos

### Estado Actual
- [x] Creado `tests/fixtures/index.ts` con factories de datos

### Acciones Completadas
- [x] `createUserFixture()` - Usuarios con PIN hash válido
- [x] `createTerminalFixture()` - Terminales y sessions
- [x] `createBatchFixture()` - Inventory batches con lotes
- [x] `createMockQuerySequence()` - Helper para secuencias de mocks
- [x] Constantes de IDs fijos para tests (TEST_PRODUCT_ID, TEST_WAREHOUSE_ID, etc.)

### Pendiente
- [ ] Documentar uso de fixtures en README de tests
- [ ] Crear script de seed para DB real (`npm run db:seed:test`)

---

## 3. Concurrencia y Bloqueos (FOR UPDATE NOWAIT)

### Problema
- `shift-handover-v2.ts` y `wms-v2.ts` usan `FOR UPDATE NOWAIT`
- Error `55P03` (lock not available) se devuelve al usuario sin reintentos
- No hay telemetría para medir frecuencia de conflictos

### Acciones Requeridas
- [x] Mejorar mensajes de error para `55P03` y `40001` (user-friendly)
- [x] Añadir logging estructurado para eventos de lock contention
- [x] Crear helper `retryWithBackoff` en `utils.ts` para uso futuro
- [ ] Implementar retry automático en UI (frontend) con toast de "reintentando..."
- [ ] Añadir telemetría/métricas para frecuencia de conflictos

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
- ~~`wms-v2.ts` no tiene trigger equivalente para movimientos manuales (`LOSS`, `ADJUSTMENT`)~~

### Acciones Requeridas
- [x] Añadir trigger de notificación en `executeStockMovementSecure` cuando `newQty <= 0`
- [ ] Unificar en helper `checkAndNotifyLowStock(batchId, newStock, context)` (opcional)

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

