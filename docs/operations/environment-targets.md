# Política mínima de entornos: `staging` / `production`

## Variable canónica

La variable que distingue entornos operativos es:

- `APP_ENV=staging`
- `APP_ENV=production`

`NODE_ENV` no reemplaza esta política. En Next.js puede seguir siendo `production` en despliegues optimizados de staging.

## Reglas operativas

### `staging`

- Puede usar base de datos y URLs de prueba.
- Puede mantener activa la cuenta DEV controlada.
- Sirve para CI, rehearsals, QA manual y smoke tests.

### `production`

- No debe compartir URLs ni base de datos con staging.
- La cuenta DEV controlada debe estar desactivada.
- `APP_URL` y `NEXT_PUBLIC_APP_URL` deben apuntar al mismo origen real.

## Excepción explícita: CI / rehearsal local

El `pre-deploy-check` permite un contexto de producción sintético cuando detecta:

- `CI=true`, o
- hosts locales / `.invalid`

Esto permite validar guards de producción sin depender de secretos ni recursos reales.

## Comandos relevantes

- `npm run dev-account:ensure`
- `npm run dev-account:disable`
- `npm run guard:predeploy:ci-db`
- `npm run guard:predeploy`

## Resultado esperado

- Staging admite la cuenta DEV y recursos de prueba.
- Producción falla cerrada si mezcla entornos o deja la cuenta DEV activa.
