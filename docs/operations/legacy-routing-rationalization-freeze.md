# E17.7 - Freeze de racionalizacion legacy de routing y superficies

## Estado

El frente de racionalizacion legacy queda cerrado. La app ya no revive shells cliente amplios ni conserva superficies paralelas con lectura sensible fuera del patron canonico.

Lo que queda consolidado:

- `/finanzas` ya no expone lectura financiera legacy. Redirige a `/analytics`.
- `/treasury/dashboard` ya no expone forecast legacy fuera del perimetro canonico. Redirige a `/finance/treasury`.
- `/dashboard`, `/inventory`, `/supply-chain` y `/logistica` ya no dependen del cliente para cortar acceso. Exigen boundary server-side antes de montar componentes cliente.
- El catch-all `src/app/[...slug]/page.tsx` ya no revive `ClientApp`. Rutas desconocidas terminan en `notFound()`.
- `LegacyClientAppPage` fue retirado.
- `/pantalla` fue retirada con `notFound()` porque no tenia contrato publico valido y dependia de `getShiftStatusSecure('default')`.

## Rutas racionalizadas

### Redirecciones canonicas

- `/finanzas` -> `/analytics`
- `/treasury/dashboard` -> `/finance/treasury`

### Retiro explicito

- `/[...slug]` -> `notFound()`
- `/pantalla` -> `notFound()`

### Endurecimiento server-side

- `/dashboard` -> sesion obligatoria server-side; sin sesion redirige a `/login`
- `/inventory` -> sesion server-side + actor inventario; sin permisos redirige a `/`
- `/supply-chain` -> sesion server-side + actor procurement; sin permisos redirige a `/`
- `/logistica` -> sesion server-side + actor scoped; sin permisos redirige a `/`

## Invariantes de routing

- Ninguna ruta interna debe depender de `RouteGuard` como boundary real de auth o RBAC.
- Ninguna ruta sensible debe leer datos server-side antes de validar sesion y scope.
- Las rutas legacy paralelas deben redirigir a una superficie canonica o retirarse.
- Los slugs desconocidos no deben caer en shells cliente de compatibilidad.
- Una pantalla publica solo puede existir si tiene contrato de producto explicito y datos canonicamente defendibles.
- IDs placeholder, defaults inventados o hints cliente no autorizan lectura operativa ni estado publico.

## No revivir

- No reintroducir un catch-all que monte `ClientApp`, `BrowserRouter` o `ProtectedRoute` como shell publico.
- No volver a usar `LegacyClientAppPage` como bridge de rutas desconocidas.
- No usar `RouteGuard` como unico corte de seguridad en paginas internas.
- No crear superficies financieras paralelas que lean datos antes de auth server-side.
- No volver a publicar pantallas tipo `/pantalla` sin contrato de producto y fuente de verdad valida.

## Criterio para rutas futuras

### Si la ruta es interna

- Debe validar sesion server-side antes de renderizar cliente.
- Debe aplicar RBAC y scope server-side si el dominio lo requiere.
- `RouteGuard` puede quedar como UX complementaria, nunca como autoridad.

### Si la ruta es publica

- Debe tener contrato explicito de producto.
- Debe consumir solo datos public-safe o tokenizados.
- Si ese contrato no existe, la ruta debe redirigir o responder `notFound()`.

### Si la ruta reemplaza una legacy

- Debe existir una superficie canonica clara.
- La legacy debe redirigir o retirarse; no mantener dos lecturas paralelas con distinta calidad.

## Diferidos explicitamente

- `/display/queue` sigue siendo un flujo publico separado y no fue racionalizado en este corte.
- Cualquier decision futura sobre nuevas superficies publicas debe abrirse como stream propio.
- Receta, finanzas canonicas y dominios transaccionales quedan fuera de este freeze.

## Decision

No continuar racionalizacion legacy sin evidencia nueva de otra superficie paralela o boundary roto. El siguiente trabajo debe volver a evolucion funcional segura, no a revivir compatibilidad legacy.
