# Handoff - Resiliencia + UX Cross-Platform (2026-02-22)

## Alcance ejecutado

- Se implementaron fixes P0 de resiliencia en pre-landing/login.
- Se mejoró la experiencia responsive para Web/Desktop/Mobile (incluye landscape).
- No se realizaron acciones de datos operativos sensibles:
  - no creación de usuarios
  - no cambios de PIN
  - no creación de sucursales
  - no creación de cajas/terminales

## Cambios aplicados

### 1) Resiliencia y observabilidad en carga pública de sucursales

- `src/actions/public-network-v2.ts`
  - Retorno tipado para fallas: `code`, `retryable`, `correlationId`, `userMessage`.
  - Clasificación de errores de DB con `classifyPgError`.
  - Instrumentación con `Sentry.captureException` + `logger.error/info`.

### 2) Pre-landing con recuperación operativa

- `src/presentation/pages/ContextSelectionPage.tsx`
  - Manejo explícito de errores tipados.
  - Botón `Reintentar`.
  - Referencia de soporte (`Ref soporte` con `correlationId` corto).
  - Fallback: `Usar última sucursal` cuando existe contexto persistido.

### 3) Resiliencia de carga de usuarios en login

- `src/actions/sync-v2.ts`
  - `getUsersForLoginSecure` devuelve `ActionFailure` tipado y reporta a Sentry.
- `src/presentation/actions/login.ts`
  - Wrapper `getUsersForLogin` con contrato tipado para UI.
- `src/presentation/pages/LandingPage.tsx`
  - Mensaje claro cuando falla la carga de usuarios.
  - Botón `Reintentar carga`.

### 4) Store de ubicaciones con fallback observable

- `src/presentation/store/useLocationStore.ts`
  - Fallas de fetch público/seguro con `Sentry.captureMessage`.
  - Toasts de error para recuperación guiada.

### 5) Paridad UX Web/Desktop/Mobile (enfoque Windows/mac + móvil)

- `electron/main.cjs`
  - `devTools` solo en desarrollo.
  - `ready-to-show` para mostrar ventana al primer paint (reduce blank/flash inicial).
- `src/hooks/usePlatform.ts`
  - Señales nuevas: `isDesktopLike`, `isLandscape`, `viewportWidth`, `viewportHeight`.
  - Detección más robusta para decidir layout y evitar controles ocultos.
- `src/presentation/layouts/SidebarLayout.tsx`
  - En viewport compacto landscape, se evita barra inferior móvil que solapa acciones.
  - Botón menú accesible en header compacto.
- `src/presentation/pages/WMSPage.tsx`
  - Layout móvil vs desktop-like más consistente.
  - Tabs desktop con `flex-wrap` para no ocultar pestañas.
  - Ancho desktop ampliado (`max-w-[1400px]`) para paridad con navegador.
  - Ajuste dinámico de espaciado inferior en mobile landscape.
- `src/presentation/components/wms/WMSBottomTabBar.tsx`
  - `bottomOffset` configurable para coexistencia con navegación inferior.
- `src/presentation/pages/SupplyChainPage.tsx`
  - Header de acciones con wrap y botones expandibles (evita botones ocultos).
  - `Analizar` full width en móvil cuando corresponde.
  - Tabla con `overflow-x-auto` + `min-w`, evita recorte en pantallas compactas.
  - Split panel (motor + kanban) activado en desktop-like y landscape útil.
- `src/presentation/components/layout/LocationSwitcher.tsx`
  - Ajuste de ancho adaptable en botón/dropdown (`w-[min(...)]`) para evitar overflow en landscape compacto.
  - Nombre de sucursal con `truncate` y contenedor `min-w-0` para evitar recorte de controles.
  - Etiqueta secundaria "Ubicación actual" se oculta en alturas muy reducidas.

### 5.1) Limpieza de hooks en Landing/login (P1)

- `src/presentation/pages/LandingPage.tsx`
  - Removidos `setState` síncronos en `useEffect` que disparaban warnings `react-hooks/set-state-in-effect`.
  - Contexto inicial derivado con `useMemo` desde `localStorage` + redirección a `/select-context` si falta contexto.
  - Nuevo flujo explícito de `openLoginModal`/`closeLoginModal` para resetear estado sin efecto reactivo.
  - Carga de usuarios de login controlada sin cascadas de render.

### 6) Kanban WMS/Supply más resiliente y sin falsos vacíos

- `src/presentation/components/supply/supplyKanbanUtils.ts`
  - Normalización de estado (`trim`, `upper`, reemplazo de espacios/guiones por `_`).
  - Soporte de estados legacy/adicionales:
    - PO: `PENDING`, `PENDING_APPROVAL`, `PENDING_RECEIPT`, `IN_TRANSIT`, `DELIVERED`.
    - Shipment: `CREATED`, `SENT`, `PENDING_RECEIPT`, `RECEIVED`, `COMPLETED`.
  - Resultado: evita columnas vacías por diferencias de casing/formato en datos heredados.
- `src/presentation/components/supply/SupplyKanban.tsx`
  - Sanitiza `effectiveLocationId` (solo UUID válido) antes de solicitar datos.
  - Si el scope por ubicación llega vacío, ejecuta fallback corporativo automático (sin ubicación).
  - Reduce casos de tablero vacío cuando la sucursal activa no tiene coincidencias directas.
- `src/domain/services/TigerDataService.ts`
  - Normaliza `locationId` con regex UUID antes de consultas de inventario/ventas/envíos/OC.
  - Evita pasar IDs legacy no UUID a acciones server-side.
- `src/presentation/store/useStore.ts`
  - `refreshShipments` y `refreshPurchaseOrders` envían errores a Sentry (`captureException`) en vez de romper el flujo.
  - Evita promesas rechazadas no controladas en refresco de Kanban.
- `tests/presentation/supply-kanban.test.tsx` (nuevo)
  - Verifica que `locationId` inválido/legacy se sanee a scope corporativo (`undefined`).
  - Verifica fallback corporativo cuando una ubicación válida no retorna movimientos.

### 7) Estabilidad de arranque en `/` ante storage corrupto

- `src/presentation/store/indexedDBStorage.ts`
  - Nueva validación `isValidPersistedStateJSON` para detectar payloads corruptos de persistencia.
  - Limpieza automática de claves inválidas en IndexedDB/localStorage (retorna `null` y evita crash en hydrate).
  - Nuevo storage seguro `safeLocalStorageStateStorage`.
- `src/presentation/store/useLocationStore.ts`
  - Persistencia migrada a `safeLocalStorageStateStorage` para no romper render si `location-storage-v2` quedó truncado/corrupto.

### 8) Eliminación de warning SSR `--localstorage-file` en Node 22+

- Hallazgo raíz:
  - El warning no venía de `NODE_OPTIONS` en shell, sino de acceso a `localStorage` durante SSR/SSG (Node 22 expone Web Storage global).
  - Se confirmó con `--trace-warnings` en build: stack dentro de middleware `persist` de Zustand.
- Cambios aplicados:
  - `src/lib/store/safePersistStorage.ts` (nuevo)
    - storage seguro para navegador real (`window.localStorage`) con guardas SSR.
  - Stores migrados a `createJSONStorage(() => safeBrowserStateStorage)`:
    - `src/lib/store/auth.ts`
    - `src/lib/store/cart.ts`
    - `src/lib/store/offlineSales.ts`
    - `src/lib/store/outboxStore.ts`
    - `src/lib/store/useAuthStore.ts`
    - `src/presentation/hooks/useCalculator.ts`
  - `src/presentation/store/useSettingsStore.ts`
    - persistencia explícita segura con `createJSONStorage` + storage protegido.
- Resultado:
  - `next dev` y `next build` dejaron de emitir el warning `--localstorage-file`.

### 9) Smoke Desktop Windows/macOS automatizado en release candidate

- `.github/workflows/release.yml`
  - Nuevo job `desktop-smoke` con matriz `windows-latest` + `macos-latest`.
  - Gating de release: `release-windows` y `release-macos` ahora dependen de `desktop-smoke`.
  - Validación en cada RC:
    - `npm run build` (baseline de paridad web).
    - `electron-builder --dir --publish never` por plataforma (artefacto unpacked, sin firma).
  - Configuración de smoke sin firma (`CSC_IDENTITY_AUTO_DISCOVERY=false`) para evitar falsos negativos de certificados.

### 10) Toolchain Capacitor estabilizado (type-check + tests)

- `package.json` / `package-lock.json`
  - Restauradas dependencias de plataforma móvil que estaban ausentes en el lock efectivo:
    - `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/splash-screen`, `@capacitor/status-bar`.
  - Resultado: `type-check` vuelve a resolver correctamente `capacitor.config.ts` y hooks de plataforma.
- `tests/presentation/usePlatform.test.tsx`
  - Ajustado el test a la implementación actual (detección por `navigator.userAgent`).
  - Se elimina mock innecesario de `@capacitor/core` y se agrega helper explícito de user-agent para escenarios desktop/móvil.

## Tests agregados/actualizados

- `tests/actions/public-network-v2.test.ts` (nuevo)
  - Sanitización de output.
  - Error tipado en timeout DB.
- `tests/presentation/usePlatform.test.tsx` (nuevo)
  - Detección desktop web.
  - Cambio native portrait -> landscape ancho con transición de `isMobile` a `isDesktopLike`.
- `tests/presentation/supply-kanban-utils.test.ts` (actualizado)
  - Mapea estados en minúsculas y con espacios (`pending receipt`, `pending approval`).
  - Verifica construcción de entradas Kanban con estados legacy normalizados.
- `tests/presentation/indexedDBStorage.test.ts` (nuevo)
  - Valida JSON correcto de estado persistido.
  - Rechaza JSON vacío/corrupto para proteger el arranque.
- `tests/e2e/procurement-v2.spec.ts` (actualizado)
  - Se corrige validación inicial para evitar `strict mode violation` por uso de `locator.or(...)`.
  - Ahora valida visibilidad de forma determinística (`container` o `heading`).
- `tests/e2e/helpers/login.ts` (actualizado)
  - Reintenta carga de usuarios en modal de login (`Reintentar carga`) antes de fallar con `LOGIN_NO_USERS_AVAILABLE`.
- `tests/e2e/wms-tabs.spec.ts` (actualizado)
  - Robustecida detección de selección de producto (verifica que realmente se agregue al carrito).
  - Selectores de destino compatibles con layout móvil/landscape.
  - Eliminados `skip` por falta de inventario: ahora valida estado vacío y botón confirmar deshabilitado.

## Validación ejecutada

- `npm run type-check` ✅
- `npm run test -- tests/presentation/usePlatform.test.tsx tests/actions/public-network-v2.test.ts tests/actions/helpers-v2.test.ts tests/presentation/useLocationStore.test.ts` ✅
- `npm run test -- tests/presentation/supply-kanban-utils.test.ts tests/presentation/usePlatform.test.tsx tests/actions/public-network-v2.test.ts` ✅
- `npm run test -- tests/presentation/indexedDBStorage.test.ts tests/presentation/supply-kanban-utils.test.ts tests/actions/public-network-v2.test.ts tests/presentation/usePlatform.test.tsx` ✅
- `npm run test -- tests/actions/wms-v2.test.ts` ✅
- `npm run test:e2e:dev -- tests/e2e/procurement-v2.spec.ts` ✅
- `npm run test -- tests/presentation/supply-kanban.test.tsx tests/presentation/supply-kanban-utils.test.ts tests/presentation/usePlatform.test.tsx tests/actions/public-network-v2.test.ts tests/presentation/indexedDBStorage.test.ts` ✅
- `npm run test:e2e:dev -- tests/e2e/wms-tabs.spec.ts --project=mobile-landscape --reporter=list` ✅ (2 passed)
- `npm run build` ✅ (sin warning `--localstorage-file`)
- `npm run type-check` ✅ (post-fix toolchain Capacitor)
- `npm run test -- tests/presentation/usePlatform.test.tsx tests/actions/public-network-v2.test.ts` ✅ (post-fix toolchain Capacitor)

## Runner E2E (Playwright) - endurecimiento

- `playwright.config.ts`
  - `workers` configurable por env y defaults estables para local.
  - `outputDir`/`report` en `/tmp` para no ensuciar el repo.
  - Selector `useProdServer` por env (`PLAYWRIGHT_USE_PROD_SERVER`).
  - Sanitización parcial de `NODE_OPTIONS` heredado.
- `package.json`
  - `test:e2e` ahora usa modo `dev` local por defecto (más estable para iteración).
  - Nuevos scripts: `test:e2e:prod`, `test:e2e:dev`, y smoke focalizado WMS/Supply.

## Smoke UI (estado)

- Smoke `procurement-v2` en `next dev` local:
  - Resultado actual: **PASS**.
  - Sin warning `--localstorage-file` tras hardening de stores persistentes.
- Smoke `procurement-v2` en modo `prod` (`build + start`):
  - Build destrabado y estable tras fix de `not-found`.
  - Pendiente solo ejecutar smoke completo en `prod` para cerrar matriz.
- Conclusión operativa:
  - Flujo E2E local operativo en `dev`.
  - WMS tabs en `mobile-landscape` ya ejecuta en verde.

## Observaciones para siguiente agente

1. Existen warnings de lint heredados en varios archivos legacy (`any`, imports no usados). `LandingPage` ya quedó saneado de `set-state-in-effect`.
2. Hay cambios no relacionados ya presentes en el working tree (reportes Playwright, seeds y otros artefactos). Revisar antes de commit final para no mezclar entregables.
3. Recomendado siguiente bloque (P1):
   - Correr smoke E2E `prod` completo (`test:e2e:prod`) para certificar release funcional sobre build final.
   - Extender cobertura landscape a `/supply-chain` + `/warehouse` con asserts visuales adicionales.

## Comandos de verificación rápida sugeridos

- `npm run type-check`
- `npm run test -- tests/presentation/usePlatform.test.tsx tests/actions/public-network-v2.test.ts tests/presentation/supply-kanban-utils.test.ts`
- Manual:
  - `/select-context` con DB lenta/caída (ver retry + ref soporte).
  - `/warehouse` en móvil portrait y landscape.
  - `/supply-chain` en móvil portrait y landscape.
  - `/warehouse` > `Kanban Suministros` validar columnas con estados legacy y fallback corporativo.
