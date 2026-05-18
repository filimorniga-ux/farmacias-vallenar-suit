# Postura de Transporte DB en Runtime

Fecha: 2026-04-01  
Repositorio: `farmacias-vallenar-suit`  
Fase: `A5.3b.2`

## 1. Decisión tomada

En este corte se aplicó una corrección inmediata al runtime y se dejó explícito el límite actual de endurecimiento TLS:

- `HECHO`: [src/app/api/inventory/truncate/route.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/app/api/inventory/truncate/route.ts) dejó de crear un `Pool` ad-hoc con configuración SSL propia
- `HECHO`: la route ahora reutiliza `getClient()` desde [src/lib/db.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/db.ts)
- `DECISIÓN`: **no** se endurece todavía `rejectUnauthorized` en runtime compartido porque no existe evidencia suficiente de CA bundle o modo de verificación de certificado ya provisionado para los entornos reales

## 2. Evidencia

Se revisó la base runtime y no apareció evidencia suficiente de configuración preparada para TLS verificado, por ejemplo:

- `PGSSLROOTCERT`
- `DB_SSL_CA_CERT`
- `sslrootcert` en `DATABASE_URL`
- `sslmode=verify-full`
- `sslmode=verify-ca`

Sí existe evidencia de una postura remota históricamente tolerante a certificados no verificados:

- [src/lib/db.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/db.ts)
- [src/lib/db-cli.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/db-cli.ts)
- múltiples scripts operativos fuera de runtime

Por eso, cambiar `rejectUnauthorized: false` a `true` en este corte habría sido un cambio de infraestructura, no un hardening local de bajo riesgo.

## 3. Qué quedó corregido

### Runtime productivo

La route:

- [src/app/api/inventory/truncate/route.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/app/api/inventory/truncate/route.ts)

ya no:

- instancia `new Pool(...)`
- repite `ssl: { rejectUnauthorized: false }`
- diverge de la capa común de DB

Ahora:

- reutiliza `getClient()`
- hereda la misma política de conexión del runtime compartido
- evita proliferar excepciones SSL locales dentro de routes

## 4. Follow-up explícito de infraestructura

Antes de endurecer TLS en [src/lib/db.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/db.ts), hace falta resolver al menos uno de estos caminos:

1. proveer CA bundle confiable al runtime
2. usar `DATABASE_URL` con modo verificable (`verify-full` o equivalente soportado)
3. documentar formalmente el requisito del proveedor administrado si entrega cadena TLS verificable distinta

Solo después de eso conviene cambiar la capa común a verificación estricta.

## 5. Regla operativa

Hasta cerrar ese follow-up:

- no crear pools runtime ad-hoc con SSL propia
- reutilizar siempre [src/lib/db.ts](/Users/miguelperdomoserrato/farmacias-vallenar-suit/src/lib/db.ts)
- tratar `rejectUnauthorized: false` como **deuda controlada de infraestructura**, no como configuración “segura” por defecto
