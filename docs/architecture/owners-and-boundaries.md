# Owners And Boundaries

## Objetivo

Este documento fija el contrato arquitectónico post-`E8` para evitar regresiones hacia modelos híbridos donde el cliente, el store local u offline vuelvan a gobernar lógica crítica.

## Reglas base

- `server actions` y utilidades server-side son la única fuente de verdad funcional.
- el cliente solo envía input mínimo y renderiza estado derivado.
- Zustand y stores locales existen solo para UX, caché transitorio y contexto visual.
- offline existe solo como `cache + pending queue + replay`; nunca como autoridad canónica.
- cualquier replay offline debe volver a pasar por auth, RBAC, scope e integridad server-side actuales.
- si un conflicto no se puede resolver de forma segura, la operación falla cerrada.

## Owners canónicos por dominio

| Dominio | Owner canónico | Cliente / Store |
| --- | --- | --- |
| Auth, sesión, RBAC, PIN | `src/actions/auth-v2.ts`, `src/lib/server-session.ts`, `src/lib/pin-rbac.ts` | solo contexto UX; no decide permisos |
| Dashboard y shell | `src/actions/dashboard-v2.ts`, `src/actions/analytics/dashboard-stats.ts`, `src/actions/manager-dashboard-v2.ts`, `src/actions/notifications-v2.ts` | bootstrap y stores solo hidratan shell |
| Caja / POS / tesorería | `src/actions/terminals-v2.ts`, `src/actions/treasury-v2.ts`, `src/actions/reconciliation-v2.ts` | POS no decide caja, terminal ni remesas |
| Inventario / WMS / procurement | `src/actions/inventory-v2.ts`, `src/actions/wms-v2.ts`, `src/actions/procurement-v2.ts` | UI manda inputs mínimos; no mueve stock por sí sola |
| Customers / quotes | `src/actions/customers-v2.ts`, `src/actions/customer-export-v2.ts`, `src/actions/quotes-v2.ts` | store local no simula persistencia crítica |
| Settings / scheduler | `src/actions/settings-v2.ts`, `src/actions/scheduler-v2.ts` | Zustand solo preferencias UI; no flags operativos |
| Sync / offline | `src/actions/sync-v2.ts`, `src/lib/sync-manager.ts` | `useStore`, `offlineSales`, `outboxStore` solo `pending/replay/cache` |

## Boundaries obligatorios

### Server-first

- no confiar `locationId`, `warehouseId`, `terminalId`, `userId`, `role` o precios enviados por cliente si el server los puede resolver desde sesión y modelo canónico.
- cualquier mutation crítica debe resolver `effectiveLocation` y `effectiveActor` server-side.

### Store local

- permitido:
  - tema
  - layout
  - estado de modales
  - selección temporal de filtros
  - estado `unsynced` o `conflict`
- prohibido:
  - flags de seguridad
  - modo fiscal/SII
  - permisos
  - stock canónico
  - balances canónicos
  - decisiones de replay

### Offline

- cada cola/caché persistida debe estar scopeada por `user + location + session version`.
- `logout` o mismatch de sesión debe invalidar o limpiar la persistencia offline.
- un conflicto offline no actualiza el estado canónico local; solo marca pendiente o conflicto visible.

## Anti-patrones prohibidos

- fallback a `getUsersForLoginSecure()` fuera del flujo de login/context selection.
- usar Zustand/localStorage para decidir comportamiento fiscal, seguridad o RBAC.
- aplicar descuentos, stock, balances o settings críticos solo en cliente.
- rehidratar datos offline sensibles sin TTL o validación de sesión/token.
- usar payload cliente como autoridad de scope cuando existe sesión server-side.

## Legacy residual permitido

- `getUsersForLoginSecure()` queda reservado al flujo explícito de login.
- `src/actions/network-v2.ts` y `src/actions/locations-v2.ts` siguen coexistiendo intencionalmente: `network` gobierna estructura organizacional visible y terminales; `locations` mantiene operaciones de inventario/transferencia y listings utilitarios ya cableados.
- scripts legacy viven bajo `src/scripts/legacy_archive/` y permanecen `fail-closed`.
- seeds y preparación de CI comparten el contrato mínimo de runtime mediante `src/scripts/runtime-schema-contract.ts`.

## Retiro controlado aplicado

- se retiró `getQueueMetrics` de `src/actions/queue-v2.ts` porque no tenía referencias reales en app, tests ni E2E.
- se retiró logging de depuración heredado en `queue-v2`, `network-v2`, `locations-v2` y `useLocationStore` cuando no aportaba observabilidad canónica.
- se retiraron parámetros internos muertos en `locations-v2` (`client` en verificadores de permisos) sin tocar firmas públicas del dominio.
- en `E9.4` se estrechó `src/presentation/store/useLocationStore.ts`: ya no expone mutaciones transicionales para alta de sucursales ni generación de pairing codes; esas decisiones viven en el consumer UI y la recarga vuelve al path canónico `fetchLocations(true)`.
- en `E9.5` se retiró `updateLocationSecure` de `src/actions/network-v2.ts` porque no tenía consumers reales en app, tests ni E2E.
- en `E10.1` se migró `src/app/procurement/smart-invoice/page.tsx` a `locations-v2` y se retiró `src/actions/get-locations-v2.ts`; el feature ya consume el path canónico sin compat residual.

## Legacy diferido

- `src/presentation/store/useLocationStore.ts` sigue siendo transicional; no se colapsa todavía porque sigue sosteniendo switching/contexto visual en múltiples consumers.
- los helpers locales `getSession()` dispersos fuera del patrón canónico quedan para un corte separado; no se unifican aquí para evitar mezclar cleanup con cambios transversales.
- entrypoints duplicados con consumers reales se conservan hasta un corte explícito de colapso de dominios/boundaries.

## Boundaries transicionales permitidos

- `src/components/auth/RouteGuard.tsx` existe solo como guard UX de hidratación/navegación; no es un boundary de seguridad.
- `src/presentation/store/useLocationStore.ts` sigue siendo un boundary transicional de contexto visual, switching y estado efímero de kioscos; no decide auth, scope ni ownership.
- `src/actions/network-v2.ts` resuelve estructura organizacional visible y terminales; `src/actions/locations-v2.ts` resuelve operaciones y listados utilitarios de locations/warehouses. No mezclar ownership sin un corte explícito de consolidación.
- cualquier wiring que siga usando `getUsersForLoginSecure()` fuera de login debe considerarse regresión arquitectónica.

## Convivencia de entrypoints

| Módulo | Ownership real | Consumers actuales | Estado | Condición de retiro |
| --- | --- | --- | --- | --- |
| `src/actions/network-v2.ts` | estructura organizacional visible, terminales y config organizacional | `OrganizationManager`, `AnalyticsDashboard`, `FinancialAccountsSettings`, `useLocationStore`, `useStore`, tests | `canonical` | retirar exports solo cuando no existan consumers reales por responsabilidad específica |
| `src/actions/locations-v2.ts` | catálogo operativo de locations, warehouses y operaciones ligadas a inventario/transferencia | analytics page, WMS pickers, inventory export, stock transfer, location edit, NetworkPage, tests | `canonical` | colapsar coexistencia solo con corte explícito de dominio y migración de consumers |

## Cierre E9

- `src/actions/network-v2.ts` queda como owner canónico de estructura organizacional visible, terminales y config de red.
- `src/actions/locations-v2.ts` queda como owner canónico de catálogo de sucursales, bodegas y operaciones ligadas a location.
- `src/actions/get-locations-v2.ts` fue retirado en `E10.1` después de migrar su último consumer productivo (`src/app/procurement/smart-invoice/page.tsx`) al path canónico.
- no quedan compat layers activas en esta frontera; cualquier caso nuevo debe usar `network-v2` o `locations-v2` según ownership.

## Deuda residual no bloqueante

- drift entre seed demo reducido, pero todavía puede existir ruido menor si nuevos módulos consultan tablas fuera del contrato mínimo.
- si un dominio nuevo necesita tablas/columnas para el gate de release, debe agregarlas al contrato compartido y no parchearse por separado.
