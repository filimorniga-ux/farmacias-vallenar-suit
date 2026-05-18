# E21.23 - Readiness de integracion de auditoria

## Estado

La auditoria incremental E11-E21 queda en fase de cierre de integracion. El arbol de trabajo sigue amplio por acumulacion deliberada de cortes, pero los gates criticos de runtime, pruebas y predeploy quedaron verdes sobre el estado actual.

Este documento no reabre dominios. Su objetivo es clasificar el diff para revision manual y preparar el cierre hacia una rama/PR limpio.

## Inventario del diff

Snapshot de integracion:

- 254 archivos trackeados modificados/eliminados.
- 159 archivos nuevos no trackeados.
- 3 eliminaciones intencionales:
  - `src/app/LegacyClientAppPage.tsx`
  - `src/actions/treasury/get-forecast.ts`
  - `src/lib/data/finance.ts`
- 1 cache generada retirada del arbol versionado:
  - `tsconfig.tsbuildinfo`

Buckets principales:

- `src/app`, `src/presentation`, `src/components`, `src/hooks`: superficies App Router, mobile/PWA, totems, WMS, reportes, settings, suppliers, public/pre-auth.
- `src/actions`, `src/app/api`, `src/lib`: server actions, rutas API, guards, cache headers, session/scope, public-safe endpoints.
- `src/db/migrations`, `src/scripts`, `scripts`: migraciones, runtime schema, guardrails de DB, predeploy y release critical gate.
- `tests/actions`, `tests/app`, `tests/presentation`, `tests/db`, `tests/scripts`, `tests/e2e`: cobertura focal y baseline para los cortes.
- `docs/operations`, `docs/security`: freezes y contratos de no-regresion.

## Implementar ahora

Ya implementado dentro del cierre:

- Ignorar artefactos locales de auditoria visual en `.gitignore`.
- Corregir el unico error real de ESLint en `src/lib/sii-config.ts`.
- Aislar el test `tests/actions/invoice-parser-v2.test.ts` de `APP_URL`/`NEXT_PUBLIC_APP_URL` para que `guard:predeploy` sea reproducible en staging/local.
- Confirmar que no hay worktrees adicionales ni cambios de agentes pendientes de merge.
- Confirmar que las eliminaciones legacy no dejan imports vivos.
- Retirar `tsconfig.tsbuildinfo` del arbol versionado y agregarlo a `.gitignore`.

## Diferir

- `npm run lint` completo mantiene warnings legacy de `any`, unused vars y prefer-const. `lint --quiet` queda limpio, por lo que no hay errores bloqueantes.
- Warnings de test harness:
  - `act(...)` en `tests/presentation/wms-recepcion-tab.test.tsx`.
  - `--localstorage-file` sin ruta valida en algunos workers.
- Mantenimiento de dependencias:
  - `baseline-browser-mapping` desactualizado.
  - advertencia Turbopack por `rimraf`/`fstream`.

## No tocar

No reabrir en este cierre:

- POS transaccional.
- Receta/enforcement.
- Finanzas sensibles.
- Automatizacion real o deploy.
- Refactor masivo de warnings ESLint.
- Reescritura de legacy routing ya congelado sin evidencia nueva.

## Validacion vigente

Comandos ejecutados sobre el estado actual:

- `git diff --check`: paso.
- `npm run lint -- --quiet`: paso con 0 errores.
- `npx tsc --noEmit`: paso.
- `npx vitest run`: 279 archivos, 1441 tests pasaron.
- `POSTGRES_URL_NON_POOLING=postgres://postgres:postgres@localhost:55433/farmacia_guardrails_ci npm run test:e2e:release:critical`: 6/6 paso.
- `DATABASE_URL=postgres://postgres:postgres@localhost:55433/farmacia_guardrails_ci npm run guard:predeploy:ci-db`: paso.
- `APP_ENV=staging DATABASE_URL=postgres://postgres:postgres@localhost:55433/farmacia_guardrails_ci npm run guard:predeploy`: 9/9 checks pasaron.

## Decision

E21.23 puede cerrarse como readiness de integracion. El siguiente corte recomendado es `E21.24 - limpieza final para revision manual`: decidir explicitamente el tratamiento de `tsconfig.tsbuildinfo`, revisar el diff por dominios para staging/commit, y preparar un resumen de PR sin tocar nuevas superficies funcionales.
