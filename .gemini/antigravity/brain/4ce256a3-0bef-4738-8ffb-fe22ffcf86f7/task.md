# Calculadora Flotante y Estabilidad DB — Checklist

## Reloj Permanente
- [x] Implementar `ChileClock` y centralizar timezone
- [x] Integrar en headers de `SidebarLayout`

## Calculadora Flotante
- [x] Crear `useCalculator.ts` (lógica + historial)
- [x] Crear `FloatingCalculator.tsx` (UI + drag)
- [x] Integrar botón en headers

## Corrección Errores Terminal (DB)
- [x] Robustecer `db.ts` con reintentos para errores transitorios
- [x] Forzar SSL para conexiones Cloud
- [x] Optimizar límites de pool de conexiones

## Depuración de UI y Server Actions
- [x] Optimizar `TerminalSettings.tsx` (evitar llamadas dobles)
- [x] Añadir `isLoadingLocations` en `useStore.ts`
- [x] Resolver inconsistencia "Sucursal Desconocida"

## Persistencia y Sincronización de Terminales
- [/] Resolver problemas de cierre y actualización de terminales
    - [ ] Optimizar `updateTerminal` y `forceCloseTerminal` en `useStore.ts`
    - [ ] Refactorizar `useEffect` y manejo de carga en `TerminalSettings.tsx`
    - [ ] Verificar integridad de datos en `terminals-v2.ts`
    - [ ] Validar que el cierre de terminal persista tras sincronización de fondo

## Verificación
- [x] TypeScript sin errores nuevos (los detectados son pre-existentes)
- [x] Monitorear terminal tras reinicio de dev server
- [x] Verificación visual final de funcionalidad actual
- [ ] Validar corrección de persistencia en terminales
