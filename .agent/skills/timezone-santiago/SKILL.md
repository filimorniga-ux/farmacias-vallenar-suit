---
name: timezone-santiago
description: Fuerza el uso de la zona horaria 'America/Santiago' (UTC-3/UTC-4) en toda la aplicación, logs y base de datos. Se activa al generar reportes, logs, timestamps o lógica de horarios.
---

# Zona Horaria Mandatoria: Chile (America/Santiago)

## Objetivo
El sistema opera físicamente en Chile. Todos los registros de tiempo, cierres de caja, vencimientos y logs deben reflejar la hora local de Santiago, NO la hora UTC del servidor.

## 1. Configuración de Entorno (Environment)
Al crear archivos de configuración o despliegue (`Dockerfile`, `vercel.json`, `.env`):
- **Instrucción:** Siempre inyecta la variable de entorno `TZ` para cambiar la hora del sistema operativo base.
- **Código:** `TZ='America/Santiago'`

## 2. Reglas de Código (TypeScript/JavaScript)
Está PROHIBIDO usar `new Date()` sin procesar, ya que devuelve la hora del servidor (UTC).

**Patrón Obligatorio:**
Usa `date-fns-tz` o `Intl` para forzar la conversión al momento de mostrar o calcular fechas críticas.

```typescript
// ❌ MAL (Devuelve UTC en Vercel)
const fecha = new Date().toISOString();

// ✅ BIEN (Fuerza Santiago)
import { toZonedTime, format } from 'date-fns-tz';
const timeZone = 'America/Santiago';
const now = new Date();
const chileTime = toZonedTime(now, timeZone);
// Formato ISO local
const isoChile = format(chileTime, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone });
```

## 3. Reglas de Base de Datos (PostgreSQL)
Al generar consultas SQL o migraciones:
- **Persistencia:** Guarda en `TIMESTAMPTZ` (UTC es aceptable para guardar), pero...
- **Consultas/Reportes:** Al agrupar datos por día (ej. "Ventas del día"), **DEBES** convertir la zona horaria antes de agrupar. Si no lo haces, las ventas de las 21:00 pasarán al día siguiente.

**Ejemplo SQL Requerido:**
```sql
-- Agrupar ventas por día real en Chile
SELECT date_trunc('day', created_at AT TIME ZONE 'America/Santiago') as dia,
       SUM(total)
FROM sales
GROUP BY 1;
```

## 4. Checklist de Validación
Antes de entregar código de cronjobs o reportes:
- [ ] ¿El cierre de caja a las 23:59 sigue siendo "hoy"? (En UTC ya sería "mañana").
- [ ] ¿Los logs muestran la hora chilena para facilitar la depuración?
