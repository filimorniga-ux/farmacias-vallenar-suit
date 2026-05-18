# Legacy archive

Este directorio contiene scripts archivados que ya no forman parte del flujo operativo actual.

## Estado

- `deprecated`: quedaron fuera del flujo soportado
- `fail-closed`: abortan a propósito y redirigen al flujo nuevo
- `reference-only`: sirven solo como contexto histórico

## Regla

No ejecutar scripts de este directorio como parte de soporte normal, seed, recovery o deploy.

Para acceso de desarrollo controlado, usar:

- `npm run dev-account:ensure`
- `npm run dev-account:disable`

Para validaciones de seguridad/deploy, usar:

- `npm run guard:legacy-pin`
- `npm run guard:predeploy`
