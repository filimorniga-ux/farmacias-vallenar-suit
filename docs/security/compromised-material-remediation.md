# Remediación Operativa de Material Sensible Comprometido

Fecha: 2026-03-26  
Repositorio: `farmacias-vallenar-suit`  
Rama de trabajo: `auditoria-fixes`

## 1. Resumen ejecutivo

Se identificó exposición de material sensible en el repositorio, incluyendo credenciales reales de base de datos en scripts/documentación y un certificado tributario `.pfx` versionado en el árbol activo.

El impacto potencial del incidente incluye:

- acceso no autorizado a base de datos y datos operativos
- compromiso de material criptográfico asociado a facturación tributaria
- posibilidad de reutilización de secretos expuestos desde historia Git o clones previos
- debilitamiento del modelo de seguridad por manejo de secretos SII en cliente

Estado actual del incidente:

- `HECHO`: el árbol activo fue saneado y ya no contiene los secretos reales detectados en la remediación inicial
- `HECHO`: el flujo SII dejó de manejar certificado y contraseña en cliente/browser/localStorage
- `HECHO`: se agregó cobertura de tests para el flujo SII server-side recién implementado
- `PENDIENTE`: purga de historia Git
- `PENDIENTE`: rotación de credenciales expuestas
- `PENDIENTE`: revocación y reemisión del certificado tributario comprometido
- `PENDIENTE`: actualización de secretos en despliegues e integraciones

El incidente no debe considerarse cerrado mientras la historia Git siga comprometida y no se hayan rotado/revocado los materiales afectados.

## 2. Alcance del material comprometido

### 2.1 Secretos y credenciales expuestos

Se detectaron credenciales reales o material sensible en el árbol activo previo a la remediación, principalmente en:

- scripts operativos y de diagnóstico con `DATABASE_URL` hardcodeada
- documentación archivada con secretos o tokens reales
- archivo de entorno auxiliar con credenciales reales
- certificado tributario `.pfx` versionado en el repositorio

Archivos saneados o eliminados del árbol activo durante la remediación:

- `.env.migration`
- `config/certs/FarmaciasVallenarCert.pfx`
- `db-test.js`
- `scripts/migrate_015.ts`
- `scripts/debug-3a-ofteno-es.js`
- `scripts/fix_templates_migration_standalone.ts`
- `src/scripts/check-triggers.cjs`
- `src/scripts/test-history-standalone.cjs`
- `src/scripts/diagnostic-fractionation.cjs`
- `src/scripts/fix_quotes_schema_direct.cjs`
- `docs/archive/MCP_CONFIG_RESTORE.md`
- `docs/archive/DEPLOY_NOW.md`

### 2.2 Certificado tributario comprometido

Se confirmó la existencia de un archivo `.pfx` en `config/certs/` dentro del árbol activo previo a la limpieza. Ese material debe tratarse como comprometido aunque hoy ya no esté versionado en la rama actual.

### 2.3 Historia Git y copias previas

Aunque el árbol actual fue saneado, la exposición histórica sigue siendo un riesgo porque:

- el material pudo quedar accesible en commits anteriores
- pudo haber sido clonado o cacheado por terceros
- pudo haber sido replicado en entornos locales, CI o respaldos

Por ese motivo, la limpieza del árbol activo no equivale a cierre del incidente.

## 3. Remediación aplicada en el árbol actual

### 3.1 Limpieza del árbol activo

Commit aplicado:

- `b4fa430` `security: remove exposed secrets and sensitive artifacts from active tree`

Acciones ejecutadas:

- eliminación del archivo `.pfx` del árbol activo
- eliminación del archivo `.env.migration` con material sensible
- reemplazo de credenciales hardcodeadas por lectura desde variables de entorno
- sanitización de documentación archivada que reproducía secretos reales
- endurecimiento de `.gitignore` para impedir versionado futuro de certificados y artefactos sensibles

### 3.2 Flujo SII movido a server-side

Commit aplicado:

- `b420cfc` `security: move SII certificate handling to server-side only`

Cambios realizados:

- creación de `src/lib/sii-config.ts` como helper server-only
- creación de `src/app/api/sii/certificate/route.ts` para upload/estado server-side
- eliminación del manejo de PFX/base64/contraseña en cliente
- eliminación de persistencia de secretos SII en el store del navegador
- reducción del tipo `SiiConfiguration` a metadatos seguros
- ajuste de `/api/sii/emitir` para leer configuración sólo desde servidor
- neutralización de la pantalla deprecated que seguía sugiriendo manejo local del certificado

### 3.3 Cobertura de tests del bloque

Commit aplicado:

- `5ceab35` `test: cover server-side SII certificate flow and client secret removal`

Cobertura agregada:

- `tests/actions/sii-certificate-route.test.ts`
- `tests/actions/sii-config.test.ts`
- `tests/actions/sii-emitir-route.test.ts`
- `tests/presentation/sii-settings.test.tsx`

Validaciones ejecutadas durante la remediación:

- `npx tsc --noEmit`
- `npx vitest run tests/actions/sii-certificate-route.test.ts tests/actions/sii-config.test.ts tests/actions/sii-emitir-route.test.ts tests/presentation/sii-settings.test.tsx`
- búsquedas dirigidas para verificar ausencia de `FileReader` y de campos sensibles SII en cliente

## 4. Riesgos residuales

Los siguientes riesgos siguen abiertos y deben tratarse como prioritarios:

- `PENDIENTE`: historia Git comprometida
- `PENDIENTE`: rotación de credenciales DB/API previamente expuestas
- `PENDIENTE`: revocación y reemisión del certificado tributario comprometido
- `PENDIENTE`: actualización de secretos en Vercel, base de datos y demás integraciones
- `PENDIENTE`: revisión de logs y accesos históricos para detectar uso del material expuesto
- `PENDIENTE`: verificación operativa posterior a rotación/revocación

Riesgos técnicos aún presentes en código:

- `src/domain/logic/sii/crypto.ts` sigue siendo stub y no representa una implementación criptográfica productiva
- `src/lib/sii-config.ts` mantiene fallback de `CONFIG_ENCRYPTION_KEY`; eso reduce el nivel de endurecimiento esperado para secretos server-side
- no hay todavía E2E del flujo SII ni integración real contra DB/sesión/cookies para este bloque

## 5. Pasos manuales obligatorios

Los siguientes pasos no fueron ejecutados por código y deben realizarse manualmente:

1. Rotar todas las credenciales DB/API que hayan estado expuestas en el repositorio.
2. Revocar y reemitir el certificado tributario comprometido.
3. Actualizar secretos en Vercel, base de datos, integraciones externas y cualquier otro entorno desplegado.
4. Revisar logs, accesos históricos y pipelines para detectar posible uso del material expuesto.
5. Purgar historia Git con una estrategia controlada usando `git filter-repo` o BFG.
6. Invalidar o reemplazar cualquier secreto derivado que dependa del material anteriormente expuesto.

Restricción importante:

- la purga de historia Git debe ejecutarse en una fase separada y controlada
- no debe hacerse a ciegas sobre `main`
- debe coordinarse con actualización de remotos y comunicación al equipo

## 6. Checklist operativo de cierre

El incidente sólo puede marcarse como cerrado cuando se cumplan todos los puntos siguientes:

- `HECHO` el árbol activo no contiene secretos reales ni artefactos sensibles versionados
- `HECHO` el flujo SII ya no maneja ni persiste secretos en cliente
- `HECHO` existe cobertura de tests para el flujo SII server-side
- `PENDIENTE` la historia Git fue purgada
- `PENDIENTE` las credenciales expuestas fueron rotadas
- `PENDIENTE` el certificado tributario fue revocado/reemitido
- `PENDIENTE` los secretos en despliegues fueron actualizados
- `PENDIENTE` se revisaron logs y accesos históricos
- `PENDIENTE` se registró evidencia operativa del cierre

Evidencias recomendadas a conservar:

- hash de commits de remediación
- salida de verificaciones técnicas ejecutadas
- registro de rotación de secretos
- comprobante de revocación/reemisión del certificado
- procedimiento usado para purge history
- validación posterior de despliegues y smoke checks

## 7. Lecciones aprendidas

- no versionar certificados, llaves privadas, tokens ni archivos de entorno con secretos reales
- no persistir secretos operativos en cliente, `localStorage`, Zustand persistido o payloads de UI
- no dejar credenciales reales en scripts de diagnóstico, migración o documentación
- separar claramente material de demo/mock de material operativo real
- exigir validaciones preventivas en CI para detectar secretos y artefactos sensibles
- reforzar políticas de documentación para impedir copiar tokens o credenciales reales
- tratar el saneamiento del árbol y la purga histórica como dos pasos distintos del mismo incidente

## 8. Anexo de evidencia técnica

Commits relevantes de remediación:

- `58dea0f` `fix: corrección de errores críticos detectados en auditoría`
- `b4fa430` `security: remove exposed secrets and sensitive artifacts from active tree`
- `b420cfc` `security: move SII certificate handling to server-side only`
- `5ceab35` `test: cover server-side SII certificate flow and client secret removal`

Archivos principales introducidos/modificados para la remediación SII:

- `src/lib/sii-config.ts`
- `src/app/api/sii/certificate/route.ts`
- `src/app/api/sii/emitir/route.ts`
- `src/presentation/pages/settings/SiiSettings.tsx`
- `src/presentation/store/useStore.ts`
- `src/domain/types.ts`
- `tests/actions/sii-certificate-route.test.ts`
- `tests/actions/sii-config.test.ts`
- `tests/actions/sii-emitir-route.test.ts`
- `tests/presentation/sii-settings.test.tsx`

Comandos de verificación ejecutados durante la remediación:

```bash
npx tsc --noEmit
npx vitest run tests/actions/sii-certificate-route.test.ts tests/actions/sii-config.test.ts tests/actions/sii-emitir-route.test.ts tests/presentation/sii-settings.test.tsx
git grep -n "FileReader" -- src/app/settings_deprecated src/presentation/pages/settings src/app/api/sii src/lib/sii-config.ts tests/presentation/sii-settings.test.tsx
git grep -n "certificado_pfx_base64\\|certificado_password" -- src/presentation src/app/api/sii src/lib/sii-config.ts src/domain/types.ts tests
```

Próxima fase recomendada:

- `C1b`: purge history + rotación/revocación operativa
