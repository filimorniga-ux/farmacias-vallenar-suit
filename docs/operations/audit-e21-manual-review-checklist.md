# E21.25 - Checklist de revision manual post-auditoria

## Objetivo

Guiar la revision manual antes de preparar PR o merge hacia `main`. Este checklist no abre nuevos cambios funcionales; prioriza confirmar que las superficies auditadas se sienten correctas en navegador real.

## Estado tecnico previo

- Branch de trabajo: `codex/auditoria-integrada-e10`.
- Worktree amplio por acumulacion de cortes E11-E21.
- No hay worktrees adicionales pendientes de merge.
- Artefactos visuales locales ignorados.
- `tsconfig.tsbuildinfo` retirado del arbol versionado e ignorado.

## Gates ya verdes

- `git diff --check`.
- `npm run lint -- --quiet`.
- `npx tsc --noEmit`.
- `npx vitest run`: 279 archivos, 1441 tests.
- `npm run test:e2e:release:critical` con `POSTGRES_URL_NON_POOLING` local rehearsal: 6/6.
- `npm run guard:predeploy` con DB local rehearsal: 9/9.

## Rutas prioritarias para revisar visualmente

### Publicas y pre-auth

- `/`
- `/login`
- `/select-context`
- `/web`
- `/kiosk`
- `/kiosk/setup`
- `/totem`
- `/totem/setup`
- `/queue`
- `/display/queue`

Confirmar:

- Sin overflow horizontal en movil.
- Targets tactiles de al menos 44px.
- Safe areas correctas en iOS/PWA.
- Mensajes de error no filtran detalle tecnico.
- Rutas publicas no muestran datos sensibles.

### Operacion interna

- `/dashboard`
- `/inventory`
- `/supply-chain`
- `/logistica`
- `/procurement/smart-order`
- `/procurement/smart-invoice`
- `/procurement/smart-invoice/list`
- `/procurement/orders`
- `/procurement/consultant`
- `/reports`
- `/reports/sales-by-product`
- `/analytics`
- `/analytics/manager-dashboard`
- `/clients`
- `/suppliers`
- `/suppliers/[id]`
- `/settings`
- `/settings/printing`
- `/settings/ai`
- `/finance/treasury`
- `/finance/monthly-closing`
- `/hr`

Confirmar:

- Navegacion App Router sin saltos a shells legacy.
- Sidebar/tabs/dropdowns consistentes en desktop y movil.
- Filtros no se solapan.
- Cards moviles reemplazan tablas cuando corresponde.
- Estados vacios, loading y error son legibles.
- Acciones sensibles siguen server-side/RBAC.

### POS y receta

- `/caja`
- `/sales/pos`

Confirmar solo superficie visible:

- Warning de condicion de venta aparece como informativo.
- No hay enforcement de receta nuevo.
- No se altera flujo transaccional POS fuera del contrato auditado.

## Rutas legacy/racionalizadas

Confirmar comportamiento esperado:

- `/finanzas` redirige a superficie canonica.
- `/treasury/dashboard` redirige a `/finance/treasury`.
- `/pantalla` no revive pantalla publica sin contrato.
- Slugs desconocidos no montan `ClientApp`.

## Riesgos diferidos no bloqueantes

- Warnings legacy de ESLint completo.
- Warning `act(...)` en test de recepcion WMS.
- Warning `--localstorage-file` en algunos workers Vitest.
- `baseline-browser-mapping` desactualizado.
- Advertencia Turbopack `rimraf`/`fstream`.
- Fixtures de tests con URLs/keys falsas para probar redaccion y politica DB.

## No revisar como bug en esta pasada

- Receta/enforcement documental.
- Automatizacion real de quick actions.
- Finanzas sensibles fuera de superficies canonicas.
- Refactor masivo de warnings.
- Cambios de dependencia no relacionados.

## Criterio de listo para PR

La rama esta lista para preparar PR cuando:

- La revision manual no encuentre regresiones visuales o de navegacion.
- No aparezcan secretos reales en diff.
- No haya artefactos locales nuevos en `git status`.
- El resumen de PR agrupe los cambios por dominio, no por lista completa de archivos.
