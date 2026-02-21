# Backlog Ejecutable P0/P1

Fecha base: 21-02-2026  
Zona horaria oficial: `America/Santiago`

## P0 - Esta semana
- [x] Resiliencia login Vercel: errores tipados + bloqueo degradado.
- [x] Healthcheck DB protegido (`/api/health/db`).
- [ ] Corregir queries ambiguas en WMS (`status`, casteos UUID, parámetros SQL tipados).
- [ ] Endurecer flujo transferencia/recepción con trazabilidad completa.
- [ ] Exportes WMS/Supply corporativos con columnas de origen/destino/actor.
- [ ] Reducir latencia de búsqueda inventario en Transferencia/Despacho (`p95 < 800ms`).

## P1 - Siguiente bloque
- [ ] Contrato unificado de movimientos WMS (transferencia/recepción/despacho).
- [ ] Generación de lote nuevo por artículo transferido con `batchColor`.
- [ ] Tab de tránsito bidireccional con filtros entrante/saliente.
- [ ] Smoke Desktop Windows/macOS en cada release candidate.
- [ ] Matriz Playwright para flujos críticos cross-platform.

## Dependencias
1. Resolver datos legacy de sucursales eliminadas vs activas.
2. Confirmar índices DB en tablas de movimientos e inventario.
3. Alinear schema de exportes con stakeholders de operación.

## KPIs de control
- `login_success_rate` > 99%.
- `server_action_db_timeout_rate` < 1%.
- `inventory_search_p95_ms` < 800.
- `critical_toasts_red` = 0 en flujos WMS/Supply.
