# E23.1 - Runbook de revision manual final

Fecha: 2026-05-13
Branch: `codex/auditoria-integrada-e10`
PR: `#15`

## Objetivo

Guiar la revision manual completa antes de decidir merge hacia `main`.

Este runbook no autoriza cambios en datos reales. La revision debe hacerse contra entorno local/demo/staging controlado.

## Estado tecnico actual

- Worktree limpio al cierre del corte.
- PR checks verdes en GitHub antes de abrir E23.1:
  - Build Verification.
  - Integration Tests.
  - Quality Checks.
  - Server Actions Validation.
- Validacion local reciente:
  - `npx tsc --noEmit`.
  - `git diff --check`.
  - `npx vitest run`: 291 archivos, 1497 tests.

## Cuenta DEV controlada

Usar solo en DB local/demo/staging controlada:

- RUT: `22.222.222-2`
- PIN: `1213`
- Nombre: `[DEV] Gerente General 1`
- Rol: `GERENTE_GENERAL`

Si la cuenta no existe en local:

```bash
npm run dev-account:ensure
```

No mantener esta cuenta activa en produccion real. El predeploy contiene verificacion para fallar cerrado si aparece activa en entorno productivo.

## Regla de base de datos para revision

- Merging a `main` mueve codigo, no filas de la base de datos.
- La base real solo cambia si se ejecutan migraciones, seeds o scripts de escritura contra ese target.
- No ejecutar scripts directos de escritura contra produccion.
- Para gates criticos usar DB non-pooling/local rehearsal, no poolers Supabase.

## Superficies a revisar

### 1. Publicas y pre-auth

Rutas:

- `/`
- `/web`
- `/select-context`
- `/kiosk`
- `/kiosk/setup`
- `/totem`
- `/totem/setup`
- `/queue`
- `/display/queue`
- `/forgot-password`
- `/reset-password/[token]`

Validar:

- Selector de sucursal visible y usable.
- Login RUT formatea mientras se escribe.
- No hay bloqueo artificial por orientacion en desktop o webview.
- Sin overflow horizontal en mobile.
- Targets tactiles adecuados.
- Mensajes publicos no exponen stack traces ni datos internos.
- Totems y pantallas publicas no muestran informacion privada fuera de su contrato.

### 2. Cajeros y POS

Rutas:

- `/caja`
- `/sales/pos`
- `/pos`

Validar:

- Inicio de sesion con RUT/PIN DEV en entorno demo.
- Apertura de caja solo en entorno controlado.
- PIN de aprobacion solicitado en flujos sensibles.
- Warning de condicion de venta es informativo, no enforcement de receta.
- No probar ventas reales ni movimientos reales contra produccion.
- Validar navegacion, modales, teclado numerico y estados de error.

### 3. Inventario, WMS y abastecimiento

Rutas:

- `/inventory`
- `/warehouse`
- `/logistica`
- `/supply-chain`
- `/procurement/smart-order`
- `/procurement/smart-invoice`
- `/procurement/invoices`
- `/procurement/orders`
- `/procurement/consultant`
- `/suppliers`
- `/suppliers/[id]`
- `/proveedores`

Validar:

- Tabs, filtros, dropdowns y acciones no se solapan en mobile.
- WMS no pierde contexto de sucursal/bodega.
- Importaciones/exportaciones muestran alcance claro.
- Acciones destructivas o masivas piden confirmacion/PIN/RBAC.
- No confundir demo inventory local con catalogo real de Supabase.
- Proveedores no debe prometer una ruta que redirige a otro dominio sin intencion visible.

### 4. Reportes, analytics y dashboard ejecutivo

Rutas:

- `/dashboard`
- `/reports`
- `/reports/sales-by-product`
- `/analytics`
- `/analytics/manager-dashboard`

Validar:

- Filtros de fecha y sucursal son consistentes.
- Exportaciones no mezclan dominios.
- Quick actions solo navegan o explican; no automatizan cambios reales.
- Estados de frescura de datos son honestos.
- En mobile, tabs/filtros no generan overflow.

### 5. Administracion, settings, RRHH y red

Rutas:

- `/settings`
- `/settings/printing`
- `/settings/ai`
- `/admin/audit`
- `/admin/cost-monitor`
- `/admin/pricing-audit`
- `/network`
- `/clients`
- `/hr`
- `/rrhh`
- `/rrhh/horarios`

Validar:

- Accesos bloqueados por rol cuando corresponda.
- Settings sensibles requieren rol autorizado.
- Formularios y botones tactiles se mantienen usables en mobile/PWA.
- No aparecen labels legacy o rutas deprecated como flujo principal.

### 6. Finanzas y cierres

Rutas:

- `/finance/treasury`
- `/finance/monthly-closing`
- `/finanzas`
- `/treasury/dashboard`

Validar solo read-only o sandbox:

- Redirecciones legacy llegan a rutas canonicas.
- Cierres/reaperturas o tesoreria sensible no se prueban contra datos reales.
- PIN/RBAC aparece en operaciones sensibles.
- Montos se visualizan en CLP de forma consistente.

## Rutas legacy esperadas

Confirmar que no reviven superficies antiguas:

- `/pantalla`
- `/_totem_deprecated`
- `/settings_deprecated/*`
- slugs desconocidos bajo `/[...slug]`

## Deuda conocida no bloqueante

- 88 scripts directos de escritura DB quedan clasificados como deuda historica no expuesta por `package.json`.
- Warnings de tests legacy (`act(...)`, logs offline y storage no disponible) siguen como ruido conocido mientras los tests pasen.
- Revision visual en dispositivo fisico iOS/Android aun puede encontrar microajustes de spacing no cubiertos por Vitest.

## Criterio para merge manual

Antes de mergear:

- PR checks verdes.
- Worktree limpio.
- Revision manual sin regresiones bloqueantes.
- Ningun script de escritura ejecutado contra produccion.
- Cuenta DEV desactivada si el target es produccion real.

Estimacion al cierre de E23.1:

- Auditoria tecnica codificada: 95% - 97%.
- Preparacion para revision manual: 92% - 95%.
- Preparacion para merge despues de revision manual: 90% - 92%.
