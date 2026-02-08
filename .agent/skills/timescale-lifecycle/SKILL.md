---
name: timescale-lifecycle-ops
description: Automatiza la gestión del ciclo de vida de los datos (Compresión, Retención, Tiering) para evitar degradación de rendimiento.
---

# Lifecycle Management (TimescaleDB/Tiger Cloud)

## Cuándo aplicar
Siempre que crees una nueva `Hypertable` o detectes tablas de logs/auditoría/ventas históricas.

## Políticas Obligatorias (Policy-as-Code)

1.  **Política de Compresión (Ahorro 95%):**
    *   Para tablas de `logs`, `audits` o `sales_history`, genera SIEMPRE el script de compresión:
    ```sql
    ALTER TABLE ventas SET (timescaledb.compress, timescaledb.compress_segmentby = 'sucursal_id');
    SELECT add_compression_policy('ventas', INTERVAL '30 days'); -- Comprimir tras 30 días
    ```

2.  **Política de Retención (Limpieza Automática):**
    *   Datos efímeros (logs de sync, carritos abandonados) DEBEN tener fecha de caducidad.
    *   `SELECT add_retention_policy('sync_logs', INTERVAL '3 months');`

3.  **Downsampling (Continuous Aggregates):**
    *   No guardes data cruda por siempre. Crea una *Materialized View* para reportes históricos (ej. ventas por mes) y borra la data cruda antigua si es necesario para ahorrar espacio.
