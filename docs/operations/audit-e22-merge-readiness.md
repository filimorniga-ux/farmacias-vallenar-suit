# E22.0 - Saneamiento y merge-readiness de auditoria

Fecha: 2026-05-12
Branch local: `codex/auditoria-integrada-e10`
Repo: `/Users/miguelperdomoserrato/farmacias-vallenar-suit`

## Objetivo

Pausar la expansion funcional de la auditoria y convertir el trabajo acumulado en un paquete revisable para merge posterior a `main`.

Este corte no busca nuevas mejoras de producto. Busca saber que hay en el worktree, que no debe limpiarse automaticamente, que requiere revision manual y que validaciones soportan el paquete.

## Estado del worktree

Inventario git al abrir E22.0:

- Entradas sucias totales: 412.
- Modificados o mixtos: 257.
- Deleted tracked: 4.
- Untracked auditables: 151.
- Archivos tracked con diff: 261.
- Diff tracked aproximado: +14638 / -5458.
- Index: sin archivos staged.
- Worktrees adicionales: no detectados.

Despues de agregar este informe, el status queda en 413 entradas: el incremento corresponde a este documento E22.0.

Deleted tracked detectados:

- `src/actions/treasury/get-forecast.ts`
- `src/app/LegacyClientAppPage.tsx`
- `src/lib/data/finance.ts`
- `tsconfig.tsbuildinfo`

Notas:

- `tsconfig.tsbuildinfo` queda cubierto por `.gitignore`; su salida del tracked tree es deseable.
- Las eliminaciones de legacy/finance estan documentadas en cortes previos y no tienen referencias activas de codigo encontradas en `src`, `tests` o `scripts`.
- Las referencias restantes a esos nombres viven en documentacion operacional de auditoria.

## Limpieza local

Se ejecuto solo dry-run de ignorados con `git clean -ndX`.

Resultado: no conviene ejecutar limpieza global. El dry-run incluye elementos locales sensibles o utiles:

- `.env`
- `.env.local`
- `.vercel/`
- `data_imports/`
- artefactos Android/iOS locales
- `node_modules/`
- `.next/`
- capturas y carpetas de auditoria visual E21

Decision: no ejecutar `git clean -fdX` global. Cualquier limpieza posterior debe ser path-specific y nunca incluir `.env`, `.env.local`, `.vercel/` ni datos de importacion sin confirmacion humana.

## Paquetes auditables

El worktree se puede revisar por paquetes, no como un diff plano:

1. Public/pre-auth/mobile/PWA
   - Prelanding, selector de sucursal, landing, totems, pantalla de turnos, consultor de precios, login y superficies publicas.
   - Riesgo: medio.
   - Revision manual: alta, porque incluye UX tactil real.

2. Routing y legacy cleanup
   - Rutas App Router canonicas, retiros legacy, layouts por modulo, redirects controlados.
   - Riesgo: medio.
   - Revision manual: verificar navegacion desde sidebar y deep links conocidos.

3. RBAC/PIN/server-first
   - Server actions, session guards, endpoints internos, settings/admin, inventory maintenance.
   - Riesgo: alto por seguridad, pero con tests amplios.
   - Revision manual: confirmar roles reales por perfil antes de merge.

4. WMS/inventario/procurement
   - RLS, WMS, recepcion/despacho/transito, smart invoice/order, proveedores.
   - Riesgo: alto operativo.
   - Revision manual: flujos no destructivos primero; flujos transaccionales solo con datos sandbox.

5. Analytics/reportes/quick actions
   - Dashboards, filtros, export, insights, reportes moviles y acciones guiadas.
   - Riesgo: medio.
   - Revision manual: consistencia visual y datos esperados.

6. Scripts/DB/predeploy
   - Guards de target DB, migraciones, runtime schema contract, seeds y scripts de seguridad.
   - Riesgo: alto si se ejecuta contra DB equivocada.
   - Revision manual: no ejecutar scripts de escritura contra produccion sin confirmacion explicita.

7. Tests y harness
   - Tests focales por dominio, Vitest global, ajustes de mocks y ruido de test-mode.
   - Riesgo: bajo.
   - Revision manual: revisar que no haya tests que fijen comportamiento equivocado.

## Clasificacion

### Implementar ahora

- Mantener este corte como saneamiento documental y de validacion.
- No seguir agregando features encima antes de estabilizar la rama.
- Preparar revision manual por paquetes.
- Mantener `tsconfig.tsbuildinfo` fuera del tracked tree.

### Diferir

- Split fino en varios commits por dominio. Es deseable, pero no bloquea la revision manual si el usuario prefiere revisar una rama completa.
- Limpieza de artefactos ignorados. Solo path-specific y fuera de secretos/datos locales.
- Auditoria visual final exhaustiva en dispositivo real. Debe hacerse despues de que la rama este estable.

### No tocar

- No usar `git clean -fdX` global.
- No revertir cambios acumulados de cortes anteriores.
- No reabrir POS transaccional, receta/enforcement, finanzas sensibles ni automatizacion real dentro de E22.0.
- No ejecutar scripts de escritura contra DB productiva.

## Validacion disponible

Validaciones recientes antes de E22.0:

- `npx tsc --noEmit`: paso.
- `npx vitest run`: paso con 282 archivos y 1468 tests.
- Gate critico local no-pooling: paso 6/6 en corte anterior.

Validacion E22.0:

- `git diff --check`: paso.
- Busqueda de marcadores reales de conflicto `<<<<<<<` / `>>>>>>>`: sin hallazgos.
- `git diff --cached --name-status`: sin staged files.
- `/opt/homebrew/bin/npx tsc --noEmit`: paso.

Nota de entorno: la sesion actual de Codex no tenia `npm`/`npx` de Homebrew en `PATH`, por lo que la validacion se ejecuto con ruta explicita.

## Porcentaje operativo

Estimacion honesta, no matematica:

- Auditoria tecnica codificada: 85% - 90%.
- Preparacion para revision manual de la app completa: 70% - 75%.
- Preparacion para merge a `main`: 60% - 65%.

Lo que falta para subir con criterio:

- Revision manual visual y funcional por perfiles: cajero, admin, gerente, WMS y superficies publicas.
- Decidir si se hara un commit unico de auditoria o commits por dominio.
- Ejecutar el gate critico una vez mas despues de cualquier staging/commit final.
- Confirmar que no se requiere publicar cambios de Vercel ni tocar variables de entorno.

## Recomendacion

Cerrar E22.0 como saneamiento y pasar a una de dos rutas:

1. Ruta recomendada: revisar manualmente esta rama por paquetes, luego stage/commit en bloque o en 3-5 commits por dominio.
2. Ruta rapida: stage completo, commit unico de auditoria integrada, correr validacion final y dejar listo para PR manual.

No recomiendo abrir nuevos cortes funcionales antes de esta revision, salvo que la revision manual encuentre un bug bloqueante.
