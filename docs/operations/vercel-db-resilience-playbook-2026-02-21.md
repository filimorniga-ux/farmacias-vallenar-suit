# Playbook P0 - Resiliencia DB en Vercel

Fecha: 21-02-2026  
Estado inicial reportado: `GET /api/db-test` responde `500` con `Connection terminated due to connection timeout` en ~15s.

## Objetivo
- Evitar que login quede en spinner infinito.
- Estandarizar errores técnicos de DB para soporte remoto.
- Habilitar healthcheck protegido para diagnóstico operacional.

## Cambios aplicados
1. `authenticateUserSecure` retorna error tipado:
   - `code`
   - `retryable`
   - `correlationId`
   - `userMessage`
2. Clasificación de fallas DB:
   - `DB_TIMEOUT`
   - `DB_AUTH`
   - `DB_DNS`
   - `DB_UNAVAILABLE`
   - `DB_UNKNOWN`
3. Endpoint protegido de salud:
   - `GET /api/health/db`
   - Header requerido: `x-health-token: $HEALTHCHECK_TOKEN` (en producción).
4. Política de degradación en login:
   - Producción: sin fallback offline cuando falla DB (`DB_*`).
   - Mensaje claro al usuario final.
5. Observabilidad:
   - Sentry + log estructurado con `correlationId`.

## Checklist operativo
1. Verificar variables en Vercel:
   - `DATABASE_URL`
   - `HEALTHCHECK_TOKEN`
   - `NODE_ENV=production`
2. Validar healthcheck:
   - `curl -H "x-health-token: <token>" https://farmaciasvallenar.vercel.app/api/health/db`
   - esperado `success: true`, `status: "ok"`.
3. Validar login:
   - con DB disponible: entra normal.
   - con DB no disponible: error controlado, sin spinner infinito.
4. Revisar Sentry por `module=auth-v2` y `code=DB_*`.

## Protocolo de incidente
1. Si `DB_TIMEOUT` o `DB_DNS` > 1% por 5 min:
   - notificar canal de incidentes.
   - congelar despliegues no críticos.
2. Si `DB_AUTH`:
   - revisar credenciales/rotación secret en Vercel.
3. Si degradación persiste > 15 min:
   - ejecutar rollback canary.
   - abrir incidente de proveedor DB.

## Rollback
1. Revertir commit de resiliencia si rompe autenticación normal.
2. Confirmar `GET /api/db-test` y `GET /api/health/db` estables.
3. Ejecutar smoke de login y módulos críticos (WMS, Supply, POS).
