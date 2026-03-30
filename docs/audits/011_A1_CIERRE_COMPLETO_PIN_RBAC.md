# Cierre Formal A1 - Consolidacion PIN / RBAC

Fecha: 2026-03-30  
Rama: `auditoria-fixes`

## Resumen

`A1` queda cerrado como frente de consolidacion de autorizacion basada en PIN y RBAC.

El trabajo se dividio en tres bloques:

- `A1.1`: creacion del helper compartido [src/lib/pin-rbac.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/pin-rbac.ts) y su cobertura base.
- `A1.2`: migracion de los modulos sensibles principales al helper comun.
- `A1.3`: limpieza tecnica, normalizacion de tests legacy y migracion de modulos secundarios con logica local residual, incluyendo los remanentes finales sensibles.

Con el cierre de `terminals-v2`, `security-v2` y `auth-v2` legacy sobre el helper comun, `A1` queda formalmente cerrado.

## Modulos Consolidados

### Nucleo sensible

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
- `terminals-v2.ts`
- `security-v2.ts`
- `auth-v2.ts` en sus vias legacy de compatibilidad
- `reports-detail-v2.ts` en el flujo sensible `getPayrollPreviewSecure()`

### Secundarios alineados durante A1.3

- `finance-closing-v2.ts`
- `financial-accounts-v2.ts`
- `operations-v2.ts`
- `wms-v2.ts`
- `network-v2.ts`
- `locations-v2.ts`
- `procurement-v2.ts`
- `supply-v2.ts`

## Criterio Final de Autoridad

- `actor real = sesion validada`
- `autorizador por PIN = metadato de auditoria`

Esto implica:

- ninguna operacion sensible debe atribuir la autoridad principal al usuario que ingreso el PIN
- `userId` recibido por payload no puede definir actor ni autorizacion
- la sesion canonica server-side es la unica fuente de verdad para identidad
- las vias legacy de UI que sobreviven por compatibilidad deben delegar al helper comun y no implementar logica propia de autoridad

## Deuda Menor Residual

Lo que queda ya no corresponde a un hueco real de autoridad, sino a deuda menor:

- wrappers locales que siguen aportando semantica de dominio aunque delegan a `pin-rbac`
- normalizacion adicional de tests/docs legacy
- posible limpieza posterior de modulos read-only o export que usan arrays de roles o wrappers de sesion por compatibilidad

## Patrones que No Deben Reintroducirse

- arrays de roles locales divergentes por modulo
- `validate*Pin` locales con logica propia de autoridad
- autoridad derivada desde `userId` enviado por cliente
- sesion local separada del modelo canonico server-side
- auditoria principal atribuida al autorizador por PIN en vez del actor de sesion
- compatibilidad legacy que salte `pin-rbac` o reintroduzca `bcrypt`/PIN validation local fuera del helper comun

## Estado

`A1: cerrado`
