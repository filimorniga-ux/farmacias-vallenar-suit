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
- Todo script de escritura DB expuesto por `package.json` debe tener guard de target local/no-pooler y test focal.
- Los scripts directos no expuestos por `package.json` no son flujo soportado hasta que tengan guardrail individual.

## No usar

No reactivar scripts legacy que reseteaban PINs masivos o reinstalaban el PIN DEV universal.
Esos archivos quedan archivados solo como referencia histórica.

No ejecutar scripts directos de escritura contra produccion durante la revision manual. Primero migrarlos a comando soportado o agregar guardrail con confirmacion explicita.
