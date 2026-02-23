# Backlog Ejecutable P0/P1

Fecha base: 21-02-2026  
Zona horaria oficial: `America/Santiago`

## P0 - Esta semana
- [x] Resiliencia login Vercel: errores tipados + bloqueo degradado.
- [x] Healthcheck DB protegido (`/api/health/db`).
- [x] Corregir queries ambiguas en WMS (`status`, casteos UUID, parámetros SQL tipados).
- [x] Endurecer flujo transferencia/recepción con trazabilidad completa.
- [x] Exportes WMS/Supply corporativos con columnas de origen/destino/actor.
- [x] Reducir latencia de búsqueda inventario en Transferencia/Despacho (`p95 < 800ms`).
- [x] Fix `Invalid UUID` en edición/envío de órdenes manuales (sanitización supplier/warehouse/product).
- [x] Resiliencia Kanban Suministros (fallback ubicación -> global -> histórico).

## P1 - Siguiente bloque
- [x] Contrato unificado de movimientos WMS (transferencia/recepción/despacho).
- [x] Generación de lote nuevo por artículo transferido con `batchColor`.
- [x] Tab de tránsito bidireccional con filtros entrante/saliente.
- [x] Smoke Desktop Windows/macOS en cada release candidate (gating agregado en `.github/workflows/release.yml`).
- [~] Matriz Playwright para flujos críticos cross-platform (suite lista, bloqueada por timeout DB en entorno de ejecución).

## Dependencias
1. Resolver datos legacy de sucursales eliminadas vs activas.
2. Confirmar índices DB en tablas de movimientos e inventario.
3. Alinear schema de exportes con stakeholders de operación.
4. Estabilizar conectividad DB en CI/Vercel para eliminar skips E2E por timeout.

## KPIs de control
- `login_success_rate` > 99%.
- `server_action_db_timeout_rate` < 1%.
- `inventory_search_p95_ms` < 800.
- `critical_toasts_red` = 0 en flujos WMS/Supply.
