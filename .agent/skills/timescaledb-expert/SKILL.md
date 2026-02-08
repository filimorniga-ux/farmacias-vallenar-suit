---
name: timescaledb-tiger-architect
description: Especialista en arquitectura de bases de datos Time-Series usando TimescaleDB y Tiger Cloud. Úsalo para diseñar esquemas, optimizar consultas (SQL), configurar Hypertables, Continuous Aggregates y gestionar el ciclo de vida de los datos (Tiering/Compression).
---

# TimescaleDB & Tiger Cloud Architect

## 1. Filosofía de Diseño (The Tiger Way)
No trates esta base de datos como un PostgreSQL estándar. Aunque es 100% compatible, para lograr el rendimiento "100x" descrito en los benchmarks [9], debes seguir estas reglas de oro:
1.  **Todo dato temporal es una Hypertable:** Si tiene un timestamp y es "append-only" (logs, métricas, eventos financieros), **DEBE** ser una hypertable, nunca una tabla normal [10].
2.  **Particionamiento Automático:** No uses `PARTITION BY` nativo de Postgres manual. Usa la función `create_hypertable()` [11].
3.  **Arquitectura Híbrida (Hypercore):** Diseña pensando en que los datos recientes viven en filas (row-store) para ingesta rápida, y los antiguos se convierten en columnas (columnar-store) para analítica [12, 13].

## 2. Gestión de Hypertables y Chunks (Manejo Exacto)

### Regla del Intervalo de Chunk (Memory Fit)
El error #1 es usar el default de 7 días sin pensar.
**Instrucción:** Al crear una hypertable, calcula el `chunk_time_interval` para que el índice del chunk activo quepa en el 25% de la RAM disponible [5, 6].

*   **Fórmula:** `Intervalo = (RAM_Sistema * 0.25) / Tasa_Ingesta_Diaria`
*   **Código Obligatorio:**
    ```sql
    -- Ejemplo para métricas de IoT (intervalo de 1 día)
    SELECT create_hypertable(
        'sensor_data',
        'time',
        chunk_time_interval => INTERVAL '1 day'
    );
    -- NUNCA crear índices únicos globales a menos que incluyan la columna de tiempo [14].
    ```

### Chunk Skipping (Optimización de Lectura)
Para consultas que filtran por columnas que no son el tiempo (ej. `order_id` o `device_id` secuencial), **DEBES** activar el *Chunk Skipping* [15, 16].
*   **Comando:** `SELECT enable_chunk_skipping('table_name', 'column_name');`
*   **Condición:** Solo funciona en columnas correlacionadas con el tiempo.

## 3. Analítica Real-Time (Continuous Aggregates)

No uses `CREATE MATERIALIZED VIEW` estándar de Postgres. Bloquean la base de datos al refrescarse y son lentas [17, 18].

**Patrón Obligatorio:**
1.  Usa `WITH (timescaledb.continuous)`.
2.  Usa `time_bucket()` en lugar de `date_trunc()` para agrupar por tiempo [19, 20].
3.  Define una política de refresco automático (`add_continuous_aggregate_policy`) [21].

**Snippet Maestro:**
```sql
CREATE MATERIALIZED VIEW daily_metrics
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', time) as bucket,
       avg(temperature) as avg_temp,
       max(cpu_usage) as max_cpu
FROM metrics
GROUP BY bucket;

-- Refresco incremental (sin recalcular todo el histórico)
SELECT add_continuous_aggregate_policy('daily_metrics',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');
```

## 4. Gestión del Ciclo de Vida (Hypercore & Tiering)
Aprovecha el motor híbrido Row-Columnar para ahorrar hasta un 95% de almacenamiento.

### Compresión (Columnar Store)
Para datos históricos que ya no se modifican frecuentemente:
*   **Segment By:** Agrupa por la columna de filtrado frecuente (ej. `device_id`, `symbol`).
*   **Order By:** Ordena por tiempo descendente o ascendente según el patrón de consulta.

```sql
ALTER TABLE metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('metrics', INTERVAL '7 days'); -- Comprime datos mayores a 7 días
```

### Data Retention (Borrado Eficiente)
Nunca uses `DELETE FROM table WHERE time < ...`. Eso genera "bloat" y es lento. Usa:
```sql
SELECT add_retention_policy('metrics', INTERVAL '1 year');
```
para eliminar chunks completos instantáneamente (DROP CHUNK).

## 5. Tiger Lake & Interoperabilidad (S3/Iceberg)
Si el usuario menciona "Data Lake", "S3" o "Histórico infinito", activa la arquitectura Tiger Lake.
*   **Instrucción:** Configura la sincronización con Iceberg para mover datos fríos a S3 pero mantenerlos consultables vía SQL estándar.
*   **Parámetro:** `ALTER TABLE my_hypertable SET (tigerlake.iceberg_sync = true);`.

## Checklist de Calidad (Antes de entregar SQL)
1. [ ] ¿Estoy usando `TIMESTAMPTZ`? (Es la mejor práctica sobre `TIMESTAMP`).
2. [ ] ¿He sugerido un `chunk_interval` acorde a la carga?
3. [ ] ¿Si hay agregaciones, estoy usando Continuous Aggregates en lugar de vistas normales?
4. [ ] ¿He incluido políticas de compresión para datos viejos?

### Por qué esta Skill es "Excelente y Exacta":

1.  **Manejo de Memoria:** Incorpora la regla del "25% de RAM" para el tamaño de los *chunks* [5], un detalle técnico crítico que la mayoría de IAs pasan por alto, evitando el temido "index thrashing" (intercambio constante de disco a RAM) [5].
2.  **Hypercore Awareness:** Distingue explícitamente entre almacenamiento por filas (para ingesta) y columnar (para compresión), instruyendo al agente a configurar `segmentby` y `orderby` correctamente para maximizar la compresión [23, 28].
3.  **Modernidad (Tiger Lake):** Incluye las referencias más recientes a **Tiger Lake** [29], permitiendo que Antigravity diseñe sistemas que sincronizan automáticamente con Amazon S3/Iceberg, algo que los modelos entrenados con datos viejos no sabrían hacer.
4.  **Corrección de SQL:** Fuerza el uso de `time_bucket` sobre `date_trunc` [19], lo cual es vital para el rendimiento en TimescaleDB.
