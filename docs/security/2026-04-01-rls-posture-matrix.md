# Matriz de Postura RLS por Tabla Crítica

Fecha: 2026-04-01  
Repositorio: `farmacias-vallenar-suit`  
Fase: `A5.3b.1`

## 1. Resumen

El sistema muestra una postura mixta:

- `HECHO`: existe una migración reciente que habilita RLS sobre muchas tablas sensibles en [migrations/enable_rls_all_tables.sql](/Users/miguelperdomoserrato/farmacias-vallenar-suit/migrations/enable_rls_all_tables.sql)
- `HECHO`: la operación real de tablas críticas ocurre hoy casi completamente vía backend privilegiado (`query()/pg`, server actions y API routes internas)
- `PENDIENTE`: no existe un baseline consistente de policies explícitas para las tablas críticas revisadas
- `PENDIENTE`: no aparece `FORCE ROW LEVEL SECURITY` en el barrido de migrations

Conclusión operativa:

- **`ENABLE RLS` sin policies no se considera defensa suficiente por sí solo**
- para las tablas críticas revisadas, la postura real hoy es mayormente **backend-only documentada**, no “RLS operativa”

## 2. Evidencia base

Fuentes principales usadas para esta normalización:

- [migrations/enable_rls_all_tables.sql](/Users/miguelperdomoserrato/farmacias-vallenar-suit/migrations/enable_rls_all_tables.sql)
- [db/migrations/018_add_rls_to_price_research_results.sql](/Users/miguelperdomoserrato/farmacias-vallenar-suit/db/migrations/018_add_rls_to_price_research_results.sql)
- [db/DB_SCHEMA_SNAPSHOT.txt](/Users/miguelperdomoserrato/farmacias-vallenar-suit/db/DB_SCHEMA_SNAPSHOT.txt)
- uso server-side visible en:
  - [src/actions/cash-management-v2.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/actions/cash-management-v2.ts)
  - [src/actions/treasury-v2.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/actions/treasury-v2.ts)
  - [src/actions/inventory-v2.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/actions/inventory-v2.ts)
  - [src/lib/server-session.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/server-session.ts)

Observación relevante:

- en el barrido de `src/` no se encontró uso operativo de `supabase.from(...)` o `createClient(...)` sobre estas tablas críticas; el control primario visible hoy es backend-side

## 3. Matriz de postura

| Tabla | RLS enabled | Policies explícitas | FORCE RLS | Postura actual | Control primario | Acción |
| --- | --- | --- | --- | --- | --- | --- |
| `terminals` | sí | no encontradas | no | backend-only documentada | server actions + API internas + sesión/RBAC | documentar |
| `cash_register_sessions` | sí | no encontradas | no | backend-only documentada | `cash-management-v2` + flows POS server-side | documentar |
| `financial_accounts` | sí | no encontradas | no | backend-only documentada | `treasury-v2` + exports/closing server-side | documentar |
| `treasury_remittances` | sí | no encontradas | no | backend-only documentada | `treasury-v2` + handover/cierre server-side | documentar |
| `treasury_transactions` | sí | no encontradas | no | backend-only documentada | `treasury-v2` + reportes/export server-side | documentar |
| `users` | sí | no encontradas para operación crítica | no | backend-only documentada | sesión server-side + PIN/RBAC + actions de usuarios | documentar |
| `inventory` | sí | no encontradas | no | mixta / revisar | tabla habilitada, pero el flujo activo parece apoyarse más en `inventory_batches`/`products` | follow-up |
| `inventory_batches` | no evidenciada en migrations específicas, pero sí tabla activa en snapshot | no encontradas | no | backend-only documentada | `inventory-v2` + WMS + reportes server-side | documentar |
| `sales` | sí | no encontradas | no | backend-only documentada | legado/histórico; control real hoy parece estar en backend | documentar |
| `sales_headers` | sí | no encontradas | no | backend-only documentada | `sales-v2`, analytics y conciliación server-side | documentar |
| `sales_items` | sí | no encontradas | no | backend-only documentada | `sales-v2`, analytics, procurement server-side | documentar |
| `employee_shifts` | sí | no encontradas | no | backend-only documentada | asistencia/turnos vía actions y SQL server-side | documentar |
| `shift_logs` | sí | no encontradas | no | backend-only documentada | handover/turnos server-side | documentar |
| `price_research_results` | sí | sí | no | RLS operativa existente | service role para writes + `authenticated` read | mantener como excepción de referencia |

## 4. Decisiones explícitas

### 4.1 Tablas clasificadas como backend-only

Para esta fase se consideran **backend-only documentadas**:

- `terminals`
- `cash_register_sessions`
- `financial_accounts`
- `treasury_remittances`
- `treasury_transactions`
- `users`
- `inventory_batches`
- `sales`
- `sales_headers`
- `sales_items`
- `employee_shifts`
- `shift_logs`

Eso significa:

- el control primario esperado hoy está en server actions, API routes internas y helpers de sesión/RBAC
- no debe asumirse que RLS provee defensa operativa suficiente para estas tablas solo por estar habilitada
- cualquier acceso nuevo desde cliente Supabase/PostgREST a estas tablas debe tratarse como cambio de postura y requerirá diseño explícito de policies

### 4.2 Tabla con RLS operativa existente

`price_research_results` es la única evidencia encontrada con:

- `ENABLE RLS`
- policy explícita para `service_role`
- policy explícita de lectura para `authenticated`

Referencia:

- [db/migrations/018_add_rls_to_price_research_results.sql](/Users/miguelperdomoserrato/farmacias-vallenar-suit/db/migrations/018_add_rls_to_price_research_results.sql)

No debe usarse como indicador de que el resto del esquema tiene el mismo nivel de definición.

### 4.3 `inventory` como caso mixto

`inventory` aparece en la migración global de `ENABLE RLS`, pero el uso operativo visible del dominio inventario ocurre sobre:

- `inventory_batches`
- `products`

Por eso `inventory` queda en postura:

- **mixta / revisar**

No se define todavía como tabla con RLS operativa ni como backend-only cerrada sin una revisión más fina del modelo de tablas activas de inventario.

## 5. Nota sobre `FORCE ROW LEVEL SECURITY`

No se encontró `FORCE ROW LEVEL SECURITY` en el barrido de migrations revisadas.

Decisión en esta fase:

- **no aplicarlo a ciegas**
- solo evaluarlo en una fase posterior para tablas donde se adopte una postura de RLS operativa real
- no usar `FORCE RLS` como parche cosmético mientras la tabla siga siendo backend-only

## 6. Follow-ups fuera de este corte

### 6.1 `A5.3b.2` runtime DB transport cleanup

Prioridad siguiente:

1. [src/app/api/inventory/truncate/route.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/app/api/inventory/truncate/route.ts)
2. [src/lib/db.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/db.ts)

Objetivo:

- eliminar pools runtime ad-hoc más laxos que la configuración base
- decidir si la base compartida puede endurecer TLS ya o si queda como follow-up de infraestructura

### 6.2 RLS real por tabla crítica

Si en el futuro alguna tabla crítica pasa a exponerse vía cliente Supabase/PostgREST o requiere acceso menos privilegiado, abrir un follow-up específico para:

- policies por `SELECT/INSERT/UPDATE/DELETE`
- scope por ubicación/tenant
- eventual `FORCE RLS`

## 7. Regla operativa

Hasta nuevo aviso:

- **no asumir que una tabla está protegida por RLS solo porque aparece en `enable_rls_all_tables.sql`**
- tratar las tablas críticas listadas aquí como **backend-only** salvo que exista una migration con policies explícitas y una decisión de postura que diga lo contrario
