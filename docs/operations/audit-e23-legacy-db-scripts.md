# E23.0 - Inventario de scripts DB legacy directos

Fecha: 2026-05-13
Branch: `codex/auditoria-integrada-e10`

## Objetivo

Cerrar el residuo de riesgo alrededor de scripts locales de base de datos antes de continuar la revision manual y el merge posterior a `main`.

Este corte no ejecuta scripts contra ninguna base de datos. Es inventario read-only y politica operacional.

## Evidencia

Inventario estatico sobre `scripts`, `src/scripts` y `src/cli`:

- Archivos de script revisados: 337.
- Scripts con patrones de escritura SQL: 112.
- Scripts de escritura ya protegidos por guardrail o fail-closed: 19.
- Scripts de escritura expuestos por `package.json` sin guardrail: 0.
- Scripts de escritura directos/historicos no expuestos por `package.json`: 88.

Guardrails ya cubiertos en cortes recientes:

- `src/scripts/run-migrations.ts`
- `src/scripts/prepare-predeploy-ci-db.ts`
- `src/scripts/seed-demo-vallenar.ts`
- `src/scripts/audit-system-health.ts`
- `src/scripts/migrate-pins-to-bcrypt.ts`
- `src/scripts/ensure-dev-gerente-general.ts`
- `src/scripts/disable-dev-gerente-general.ts`
- `src/cli/terminals.ts`
- `src/scripts/fix-migrations-schema.ts`
- `src/scripts/seed-shift-templates.ts`
- scripts legacy puntuales cubiertos por `scripts/legacy-db-script-guard.cjs`

## Clasificacion

### Implementar ahora

- Mantener el test `tests/scripts/package-db-script-safety.test.ts`: cualquier script DB de escritura que se publique via `package.json` debe tener guardrail o bloqueo local.
- Mantener `scripts/README.md` y `src/scripts/README.md` como politica visible para revision manual.
- No ampliar el flujo soportado agregando scripts historicos a `package.json` sin guardrail y test.

### Diferir

- Migrar o archivar los 88 scripts directos de escritura restantes por lotes pequenos.
- Priorizar primero scripts con `DELETE`, `TRUNCATE`, `DROP` o cambios masivos:
  - `src/scripts/seed-production-structure.ts`
  - `src/scripts/setup-demo-infrastructure.ts`
  - `src/scripts/consolidate-locations.ts`
  - `src/scripts/final-cleanup.ts`
  - `src/scripts/import-excel-data.ts`
  - `src/scripts/seed-smart-procurement.ts`
  - `src/scripts/seed-suppliers-real.ts`
  - `src/scripts/verify-po-flow.ts`
  - `scripts/inspect_schema.ts`
- Convertir los que sigan siendo necesarios a comandos soportados con `assertScriptDbWriteTargetAllowed`.

### No tocar por seguridad

- No ejecutar scripts directos de escritura contra produccion.
- No mover 88 scripts en masa dentro de esta rama: generaria ruido de review y riesgo de romper utilidades de diagnostico.
- No usar `git clean -fdX` global para limpiar scripts, artefactos o datos locales.

## Decision

E23.0 deja la rama en estado merge-review aceptable para scripts DB expuestos: los comandos soportados tienen guardrails o tests que los exigen.

La deuda restante no es un bloqueo directo del PR porque no esta expuesta en `package.json`, pero debe tratarse como deuda operacional antes de promocionar cualquier script directo a flujo oficial.

## Validacion esperada

- `npx vitest run tests/scripts/package-db-script-safety.test.ts`
- `npx tsc --noEmit`
- `git diff --check`
