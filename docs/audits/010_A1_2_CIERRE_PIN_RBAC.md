# Cierre Formal A1.2 - Consolidacion PIN / RBAC

Fecha: 2026-03-30  
Rama: `auditoria-fixes`

## Resumen

`A1` tuvo dos bloques:

- `A1.1`: creacion del helper compartido [src/lib/pin-rbac.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/pin-rbac.ts) y su cobertura base.
- `A1.2`: migracion progresiva de los modulos sensibles al helper comun, eliminando validaciones locales divergentes de sesion, roles y PIN.

Con el ajuste final de payroll/reporting, `A1.2` queda cerrado en los modulos sensibles.

## Modulos Sensibles Consolidados

- `treasury-v2.ts`
- `cash-v2.ts`
- `cash-management-v2.ts`
- `products-v2.ts`
- `settings-v2.ts`
- `quotes-v2.ts`
- `reconciliation-v2.ts`
- `attendance-v2.ts`
- `shift-handover-v2.ts`
- `sales-v2.ts`
- `inventory-v2.ts`
- `hardware-v2.ts`
- `reports-detail-v2.ts` en el flujo sensible `getPayrollPreviewSecure()`

## Criterio de Autoridad Final

- `actor real = sesion validada`
- `autorizador por PIN = metadato de auditoria`

Esto implica:

- ninguna operacion sensible debe atribuir la autoridad principal al usuario que ingreso el PIN
- `userId` recibido por payload no puede definir actor ni autorizacion
- la sesion canonica server-side es la unica fuente de verdad para identidad

## Deuda Menor para A1.3

- retirar wrappers locales que ya solo delegan a `pin-rbac`
- normalizar tests legacy que todavia mockean contratos viejos
- revisar modulos secundarios fuera del nucleo sensible
- documentar la excepcion de desarrollo permitida en un solo lugar

## Patrones que No Deben Reintroducirse

- arrays de roles locales divergentes por modulo
- `validate*Pin` locales con logica propia
- autoridad derivada desde `userId` enviado por cliente
- sesion local separada del modelo canonico server-side
- auditoria principal atribuida al autorizador por PIN en vez del actor de sesion

## Estado

`A1.2: cerrado`
