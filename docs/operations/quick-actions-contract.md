# E12.8 - Contrato congelado de quick actions operativas

## Estado

E12 queda cerrado para el frente de operacion asistida. Las quick actions quedan como una capa read-only sobre alertas, sugerencias y reportes existentes. No ejecutan mutaciones, no automatizan decisiones y no convierten la URL en autoridad operativa.

## Definiciones

**Suggestion**

Recomendacion server-side asociada a una alerta operativa. Explica que revisar y por que. Puede existir sin boton accionable.

**Quick action**

Navegacion o prefill seguro desde una suggestion hacia un flujo ya existente. Su unico efecto permitido es abrir una pantalla con contexto visible. No crea, aprueba, cierra, reintenta ni cambia estados.

**Destination context**

Contexto heredado por query params, por ejemplo `startDate`, `endDate`, `locationId`, `warehouseId`, `source` y `alertId`. La pantalla destino puede reconocerlo como hint visible, pero debe revalidar cualquier dato operativo contra server/actions antes de usarlo.

## Tiers de calidad

**recommended**

Alta señal de utilidad y baja friccion. Se renderiza como suggestion y como CTA principal si su `actionMode` tambien es seguro.

**standard**

Utilidad aceptable. Se mantiene visible como CTA principal, sin trato preferente.

**suppressed**

Baja señal o friccion alta. Se mantiene como suggestion textual para trazabilidad, pero no se renderiza como CTA principal, no muestra badge de modo de accion y no emite `quick_action_visible`.

## Invariantes

- La URL nunca gobierna sesion, scope, caja, bodega ni autorizacion.
- Una quick action solo puede navegar o prellenar contexto seguro.
- `suppressed` no renderiza CTA principal.
- `suggestion_shown` puede emitirse para una suggestion suprimida; `quick_action_visible` no.
- `quick_action_clicked` solo se emite por interaccion visible real sobre CTA principal.
- Observabilidad UX no implica exito operativo ni exito de negocio.
- El destino debe declarar el consumo de contexto como `contextAccepted`, `contextRejected` o `contextIgnored`.
- Contexto invalido o incompleto no autoriza datos ni mutaciones.
- No hay automatizacion implicita, cron jobs, colas, persistencia nueva ni escrituras de negocio en este frente.

## Permitido

- Mostrar una suggestion read-only.
- Mostrar CTA para `recommended` o `standard`.
- Abrir reportes o pantallas existentes con filtros/hints.
- Mostrar contexto heredado si fue reconocido.
- Registrar eventos sanitizados de exposicion, click y destino.

## No permitido

- Crear ordenes de compra automaticamente.
- Cerrar, reabrir o modificar cajas automaticamente.
- Reintentar transferencias o recepciones WMS automaticamente.
- Inferir exito de negocio desde una navegacion.
- Usar `locationId` o `warehouseId` de la URL como autoridad.
- Agregar quick actions nuevas sin pasar por contrato, ranking y tests.

## Eventos UX

Los eventos permitidos son:

- `suggestion_shown`
- `quick_action_visible`
- `quick_action_clicked`
- `destination_opened`
- `destination_context_accepted`
- `destination_context_rejected`
- `destination_context_ignored`

El payload debe ser minimo y sanitizado: `alertId`, `suggestionId`, `targetModule`, `actionMode`, `destination`, `destinationStatus`, `reason`, `hasDateRange`, `hasLocationId` y `hasWarehouseId`.

No se deben incluir usuarios, sesiones, documentos, montos sensibles, snapshots completos ni URLs crudas con datos innecesarios.

## Cierre ejecutivo E12

E12 dejo una capa operativa completa y controlada:

- KPIs confiables y server-first.
- Dashboard operativo.
- Drill-downs hacia reportes por dominio.
- Alertas accionables.
- Sugerencias navegacionales.
- Quick actions seguras.
- Observabilidad UX del recorrido.
- Tuning deterministico de valor.
- Poda de CTAs de baja señal.

El frente queda congelado. El siguiente trabajo sobre quick actions debe basarse en evidencia nueva de producto, no en agregar mas CTAs por defecto.
