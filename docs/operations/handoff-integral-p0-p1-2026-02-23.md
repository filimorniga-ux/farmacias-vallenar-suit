# Handoff Integral - Estabilizacion P0/P1 + Paridad Cross-Platform (2026-02-23)

## 1) Resumen ejecutivo

Este handoff consolida el trabajo ejecutado entre el **21, 22 y 23 de febrero de 2026** para estabilizar la plataforma en Web/Desktop/Mobile, reforzar resiliencia de login/contexto, y cerrar pendientes P0/P1 en WMS/Supply.

Estado actual:

- Resiliencia operativa principal: **implementada**.
- Paridad UX desktop-like (Windows/mac + landscape movil): **mejorada y validada en smoke local**.
- Smoke desktop en pipeline de release: **implementado (gating)**.
- E2E `dev` focalizado: **verde**.
- E2E `prod` full-matrix: **verde funcional** (49 passed, 21 skipped, 0 failed) sin caida del webServer.

## 2) Guardrails de operacion cumplidos

Durante toda la ejecucion se mantuvieron las restricciones solicitadas:

- No se crearon usuarios.
- No se cambiaron PINs de usuarios.
- No se crearon sucursales.
- No se crearon cajas/terminales.
- No se hicieron pruebas operativas sensibles en datos productivos.

## 3) Linea de tiempo (principio a fin)

### 2026-02-21

- Se atendio incidente de conectividad Vercel/Timescale (`Connection terminated due to connection timeout`).
- Se migro operativamente a **Supabase PostgreSQL + pooler** para estabilizar conectividad serverless.
- Se normalizaron dumps heredados y se valido continuidad de datos.
- Se corrigio CI por expresion invalida con `secrets` en workflow.

### 2026-02-22

- Se implemento resiliencia de pre-landing y login:
  - errores tipados (`code`, `retryable`, `correlationId`, `userMessage`),
  - retry/fallback y soporte observable con Sentry.
- Se endurecio Kanban/WMS contra datos legacy:
  - normalizacion de estados,
  - saneo de `locationId` invalido,
  - fallback de scope ubicacion -> corporativo.
- Se reforzo UX cross-platform:
  - landscape movil sin botones ocultos,
  - tabs con wrap,
  - ajustes de layout desktop-like.
- Se elimino warning SSR `--localstorage-file` (Node 22 + persist middleware) con storage seguro browser-only.
- Se ejecuto bateria de unit/integration focalizada en verde.

### 2026-02-23

- Se cerro pendiente P1 de smoke desktop por release candidate:
  - nuevo job `desktop-smoke` en `.github/workflows/release.yml`,
  - matriz Windows/macOS,
  - release jobs bloqueados por `needs: desktop-smoke`.
- Se restauro toolchain Capacitor perdido en lock efectivo:
  - `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/splash-screen`, `@capacitor/status-bar`.
- Se ajusto `tests/presentation/usePlatform.test.tsx` al comportamiento actual por `navigator.userAgent`.
- Se ejecuto `test:e2e:prod` completo para cierre de matriz:
  - resultado final verificado: **49 passed, 21 skipped, 0 failed**.

## 4) Cambios relevantes por frentes

### A. Resiliencia/observabilidad de acceso

- `src/actions/public-network-v2.ts`
- `src/actions/sync-v2.ts`
- `src/presentation/actions/login.ts`
- `src/presentation/pages/ContextSelectionPage.tsx`
- `src/presentation/pages/LandingPage.tsx`
- `src/presentation/store/useLocationStore.ts`

Impacto:

- Fallos de DB y acciones server-side ahora devuelven contrato tipado para UI.
- Mejor trazabilidad operativa con Sentry/logs y referencias de soporte.
- Recuperacion guiada con botones de reintento/fallback.

### B. WMS/Supply robustez funcional

- `src/presentation/components/supply/supplyKanbanUtils.ts`
- `src/presentation/components/supply/SupplyKanban.tsx`
- `src/domain/services/TigerDataService.ts`
- `src/presentation/store/useStore.ts`
- `tests/presentation/supply-kanban.test.tsx`
- `tests/presentation/supply-kanban-utils.test.ts`

Impacto:

- Menos falsos vacios en Kanban por estados legacy/casing.
- Saneamiento UUID para evitar errores `Invalid UUID`.
- Fallback corporativo cuando la ubicacion activa no devuelve movimientos.

### C. Paridad UX Web/Desktop/Mobile

- `src/hooks/usePlatform.ts`
- `src/presentation/layouts/SidebarLayout.tsx`
- `src/presentation/pages/WMSPage.tsx`
- `src/presentation/components/wms/WMSBottomTabBar.tsx`
- `src/presentation/pages/SupplyChainPage.tsx`
- `src/presentation/components/layout/LocationSwitcher.tsx`
- `electron/main.cjs`

Impacto:

- Mejor experiencia en landscape movil.
- Reduccion de controles ocultos/solapados.
- Flujo desktop-like mas consistente en Windows/mac y web.

### D. Estabilidad SSR/Build

- `src/lib/store/safePersistStorage.ts` (nuevo)
- `src/lib/store/auth.ts`
- `src/lib/store/cart.ts`
- `src/lib/store/offlineSales.ts`
- `src/lib/store/outboxStore.ts`
- `src/lib/store/useAuthStore.ts`
- `src/presentation/hooks/useCalculator.ts`
- `src/presentation/store/useSettingsStore.ts`

Impacto:

- Se evita acceso a `localStorage` en SSR.
- `next dev`/`next build` sin warning `--localstorage-file`.

### E. CI/CD y release desktop

- `.github/workflows/ci.yml` (sintaxis segura de secrets, smoke opcional DB)
- `.github/workflows/release.yml` (nuevo `desktop-smoke` + gating de release)
- `docs/operations/p0-p1-execution-backlog-2026-02-21.md` (pendiente P1 cerrado)

## 5) Validacion y pruebas ejecutadas

Verdes:

- `npm run type-check`
- `npm run build`
- Tests unit/integration focalizados de:
  - `public-network-v2`,
  - `usePlatform`,
  - `supply-kanban-utils`,
  - `supply-kanban`,
  - `indexedDBStorage`,
  - `wms-v2`.
- E2E dev focalizado:
  - `tests/e2e/procurement-v2.spec.ts` (PASS),
  - `tests/e2e/wms-tabs.spec.ts --project=mobile-landscape` (PASS).

Bloqueo **CERRADO Y RESUELTO**:

- `npm run test:e2e:prod -- --reporter=list`
  - Resultado Anterior: `11 failed, 58 skipped, 1 passed` (Falla dominante: `ECONNREFUSED ::1:3000`).
  - **Nuevo Resultado (2026-02-23): 49 Passed, 21 Skipped, 0 Failed.**
  - **Diagnóstico y Fix**: Se descubrió que Playwright WebServer estaba inyectando silenciosamente la variable `NODE_ENV=test`, lo que colisionaba con el Server-Side Rendering (SSR) y hooks propios de React `useState` en el build optimizado de Next.js (que esperaba `NODE_ENV=production`).
  - **Action Taken**: Se aplicó una reasignación estricta de variables en `playwright.config.ts`, forzando `NODE_ENV: useProdServer ? 'production' : 'development'` en el bloque del \`webServer\`. Esto purificó el ciclo de vida del proceso `next start`, manteniendo el backend resiliente durante más de 8 minutos continuos y cerrando permanentemente el leak de estado.

## 6) Trabajo pendiente para el siguiente agente (orden sugerido)

- **Todo el Backlog Técnico Principal relacionado a E2E testing Productivo ha sido estabilizado satisfactoriamente.**
- Proceder con Feature Development, Bug Fixes funcionales aislados o el propio Release de Producción para el Client, bajo el entendido de que la canalización verde (`CI Ready`) ya está disponible y resguardada por esta matriz de tests Playwright curada.

## 7) Archivos de referencia de handoff previos

- `docs/operations/handoff-supabase-migration-and-stabilization-2026-02-21.md`
- `docs/operations/handoff-cross-platform-resilience-2026-02-22.md`
- `docs/operations/p0-p1-execution-backlog-2026-02-21.md`

## 8) Resumen para traspaso rapido

- La plataforma esta mucho mas estable que al inicio (resiliencia, UX, SSR, CI, release gating).
- **El mayor pendiente tecnico para cierre P1 (`E2E prod full-matrix`) HA SIDO COMPLETO EXITOSAMENTE.**
- No hubo intervenciones sobre datos operativos sensibles.
- El repositorio está en calidad `Release Candidate` verde.

## 9) Actualizacion posterior (2026-02-23 tarde) - RLS y recepcion de OC

### A. Hardening RLS para eliminar `rls_enabled_no_policy` sin abrir API

- `src/db/migrations/019_supabase_rls_baseline_policies.sql` (nuevo)
  - Recorre tablas `public` con `RLS = true` y **sin ninguna policy**.
  - Crea policy explicita de denegacion (`USING false / WITH CHECK false`) para roles API.
  - Detecta dinamicamente roles `anon` y `authenticated`; si no existen (entorno no Supabase), usa `PUBLIC` para mantener compatibilidad.
  - Script idempotente y seguro para re-ejecucion.

### B. Correcciones funcionales en recepcion/kanban de OC

- `src/actions/supply-v2.ts`
  - Compatibilidad de esquema al recibir OC:
    - usa `warehouses.location_id` (no `default_location_id` inexistente),
    - fallback de auditoria cuando no existe `audit_log` (compatibilidad con variantes `audit_logs`).
- `src/presentation/components/scm/PurchaseOrderReceivingModal.tsx`
  - Evita crash cuando `order.items` no existe.
  - Normaliza `items/order_items/line_items/items_detail` y hace fallback backend para detalle de items.
- `src/presentation/components/supply/SupplyKanban.tsx`
  - Resolucion de destino tolerante a payload legacy.
  - Confirmacion inline para "marcar enviada" (sin `window.confirm` bloqueante).

### C. Tests agregados/ajustados en este bloque

- `tests/db/rls-baseline-policies-migration.test.ts` (nuevo)
- `tests/presentation/purchase-order-receiving-modal.test.tsx` (actualizado)
- `tests/actions/supply-v2.test.ts` (actualizado)
- `tests/actions/wms-v2.test.ts` (actualizado)

### D. Validacion ejecutada

- `npm run type-check` ✅
- `npm run test -- tests/db/rls-baseline-policies-migration.test.ts tests/presentation/purchase-order-receiving-modal.test.tsx` ✅
