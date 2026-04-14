# Scripts operativos

Este directorio mezcla utilitarios vigentes, seeds y herramientas de diagnóstico.

## Flujo vigente recomendado

- Cuenta DEV controlada:
  - `npm run dev-account:ensure`
  - `npm run dev-account:disable`
- Guardrails:
  - `npm run guard:legacy-pin`
  - `npm run guard:predeploy:ci-db`
  - `npm run guard:predeploy`
- Seeds de trabajo:
  - `npm run seed:demo`
  - `npm run seed:sandbox`
- Auditoría/seguridad:
  - `npm run security:audit`
  - `npm run migrate:pins`

## Criterio de uso

- Los scripts del flujo actual viven en `src/scripts/`.
- Los scripts fail-closed o deprecados se mueven a `src/scripts/legacy_archive/`.
- Si necesitas una credencial conocida de desarrollo, usa la cuenta DEV controlada definida en `dev-account-support.ts`.

## No usar

No reactivar scripts legacy que reseteaban PINs masivos o reinstalaban `1213`.
Esos archivos quedan archivados solo como referencia histórica.
