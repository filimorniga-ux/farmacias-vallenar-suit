# E17.2e.freeze - Freeze de condicion de venta y receta

## Estado congelado

El frente de receta queda cerrado en modo informativo. La aplicacion ya tiene una base tecnica consistente para mostrar advertencias en caja, pero no tiene todavia contrato suficiente para exigir confirmacion operativa, documento o bloqueo de venta.

Lo que existe hoy:

- Contrato canonico de condicion de venta: `VD`, `R`, `RR`, `RCH`.
- Columna minima `products.condicion_venta` en runtime schema y seed demo.
- Backfill/normalizacion de vocabulario legacy hacia el contrato canonico.
- Warning read-only en caja para `R`, `RR` y `RCH`.
- Read-side canonico basado en `products.condicion_venta`.
- `requiresPrescription` degradado a senal no autoritativa.

Lo que no existe todavia:

- Persistencia de confirmacion de receta en venta.
- Persistencia de documento, folio o evidencia asociada.
- Auditoria especifica de venta con receta.
- Decision de negocio/regulatoria sobre advertir, confirmar o bloquear.
- Enforcement server-side en `createSaleSecure`.

## Invariantes actuales

- `products.condicion_venta` es la fuente tecnica canonica para el read-side.
- El mapping canonico es `VD`, `R`, `RR`, `RCH`.
- Valores legacy conocidos se normalizan asi:
  - `LIBRE` y `VENTA_DIRECTA` -> `VD`
  - `RECETA_SIMPLE` -> `R`
  - `RECETA_RETENIDA` -> `RR`
  - `RECETA_CHEQUE` -> `RCH`
- Valores nulos o desconocidos degradan a `VD` hasta que exista una decision formal distinta.
- El warning de caja no bloquea venta, no pide documento y no cambia la transaccion.
- La URL, el cliente y `requiresPrescription` no gobiernan la condicion de venta.

## Prerequisitos para enforcement futuro

Antes de abrir `E17.2e.4`, debe existir una decision explicita sobre:

- Nivel operativo por condicion:
  - `warning`: solo aviso.
  - `confirmation`: confirmacion manual no documental.
  - `block`: bloqueo sin evidencia.
- Modelo de persistencia:
  - campo o entidad para confirmacion manual.
  - campo o entidad para folio/documento si aplica.
  - relacion con `sales` o `sale_items`.
- Auditoria:
  - actor que confirma.
  - condicion del producto vendido.
  - timestamp.
  - sucursal/caja/sesion.
  - motivo o evidencia minima si aplica.
- UX de caja:
  - texto visible por nivel.
  - pasos requeridos.
  - errores y recuperacion.
- Politica regulatoria/negocio:
  - que condicion solo advierte.
  - que condicion exige confirmacion.
  - que condicion bloquea.
  - excepciones permitidas y responsabilidad operacional.

## Decision

No continuar con enforcement de receta hasta que los prerequisitos anteriores esten definidos. El estado final valido por ahora es warning informativo read-only respaldado por `products.condicion_venta`.

El siguiente movimiento recomendado es salir de este stream y volver al backlog funcional general con un corte no regulatorio, por ejemplo `E17.3 - nueva shortlist read-only de mejoras funcionales pequenas`.
