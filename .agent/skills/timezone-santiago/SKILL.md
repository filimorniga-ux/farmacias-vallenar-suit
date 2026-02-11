---
name: timezone-santiago
description: Fuerza el uso de la zona horaria 'America/Santiago' (UTC-3/UTC-4) en toda la aplicación, logs y base de datos. Se activa al generar reportes, logs, timestamps o lógica de horarios.
---

# Zona Horaria Mandatoria: Chile (America/Santiago)

## Objetivo
El sistema opera físicamente en Chile (Región de Atacama). **TODA** fecha y hora visible para el usuario DEBE reflejar la hora local de Santiago (`America/Santiago`), que cambia automáticamente entre:
- **Horario de Verano (CLST):** UTC-3 (primer sábado de septiembre → primer sábado de abril)
- **Horario de Invierno (CLT):** UTC-4 (primer sábado de abril → primer sábado de septiembre)

> **REGLA CARDINAL:** El almacenamiento interno es en UTC. La conversión a Santiago se hace SIEMPRE en el punto de salida (UI, tickets, exports, PDFs, reportes).

---

## 1. Constante Global

Todo proyecto DEBE tener una constante centralizada. **NUNCA** escribas el string `'America/Santiago'` disperso por el código.

```typescript
// src/lib/constants.ts (o similar)
export const TIMEZONE = 'America/Santiago' as const;
export const LOCALE = 'es-CL' as const;
```

---

## 2. Funciones de Formateo (Obligatorias)

### 2.1 Usando `Intl.DateTimeFormat` (sin dependencias)

Este es el método preferido para componentes React y server actions:

```typescript
import { TIMEZONE, LOCALE } from '@/lib/constants';

// Formatear fecha + hora completa
export function formatDateTimeCL(date: Date | number | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

// Formatear solo fecha (para reportes, filtros)
export function formatDateCL(date: Date | number | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

// Formatear solo hora (para tickets, logs)
export function formatTimeCL(date: Date | number | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

// Obtener "hoy" en Santiago (para filtros de fecha)
export function getTodayCL(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // Retorna "2026-02-11"
}
```

### 2.2 Usando `date-fns-tz` (si ya está instalado)

```typescript
import { toZonedTime, format } from 'date-fns-tz';
import { TIMEZONE } from '@/lib/constants';

const chileTime = toZonedTime(new Date(), TIMEZONE);
const formatted = format(chileTime, "dd/MM/yyyy HH:mm:ss", { timeZone: TIMEZONE });
```

---

## 3. Reglas por Contexto

### 3.1 Componentes React (UI)
```typescript
// ❌ PROHIBIDO
<span>{new Date(timestamp).toLocaleString()}</span>
<span>{new Date().toISOString()}</span>

// ✅ OBLIGATORIO
<span>{formatDateTimeCL(timestamp)}</span>
```

### 3.2 Tickets de Impresión (POS Thermal)
Los tickets deben mostrar fecha/hora **legible en formato chileno**:
```typescript
// En la función de generación de ticket
const ticketDate = formatDateTimeCL(sale.timestamp);
// Resultado: "11-02-2026 11:04:21" (hora Santiago)

// Para el encabezado del ticket:
const headerLine = `Fecha: ${formatDateCL(sale.timestamp)} ${formatTimeCL(sale.timestamp)}`;
```

### 3.3 Documentos Descargables (PDF, Excel, CSV)
Toda fecha en documentos generados en el servidor DEBE usar la conversión:
```typescript
// En server actions que generan exports
const reportDate = formatDateTimeCL(new Date());
const fileName = `reporte_ventas_${formatDateCL(new Date()).replace(/\//g, '-')}.csv`;

// Dentro del contenido del archivo
rows.forEach(row => {
  row.fecha = formatDateTimeCL(row.created_at); // NO row.created_at.toISOString()
});
```

### 3.4 Reportes de Asistencia / RRHH
```typescript
// Hora de marca de asistencia
const checkInTime = formatTimeCL(attendance.timestamp); // "08:32:15"
const checkInDate = formatDateCL(attendance.timestamp); // "11-02-2026"
```

### 3.5 Logs y Observabilidad (Sentry / Console)
Los logs del servidor pueden permanecer en UTC para debugging internacional, pero los logs visibles al usuario (panel admin, historial de acciones) DEBEN estar en Santiago:
```typescript
// Log interno (OK en UTC)
logger.info({ timestamp: new Date().toISOString() }, 'Sale created');

// Log visible al usuario (DEBE ser Santiago)
auditEntry.display_time = formatDateTimeCL(new Date());
```

---

## 4. Reglas de Base de Datos (PostgreSQL / TimescaleDB)

### 4.1 Almacenamiento
- **Tipo de columna:** Siempre `TIMESTAMPTZ` (timestamp with time zone).
- **Valor guardado:** UTC (comportamiento por defecto de PostgreSQL). **Esto es correcto.**
- **NUNCA** guardes strings formateados como fecha. Guarda el timestamp UTC y convierte al leer.

### 4.2 Consultas con Agrupación por Día
Si agrupas por día sin convertir, las ventas de las 21:00-23:59 (hora Chile) caerán en el día siguiente UTC.

```sql
-- ❌ MAL (agrupa por día UTC, pierde ventas nocturnas)
SELECT date_trunc('day', created_at) as dia, SUM(total)
FROM sales GROUP BY 1;

-- ✅ BIEN (agrupa por día real en Chile)
SELECT date_trunc('day', created_at AT TIME ZONE 'America/Santiago') as dia,
       SUM(total)
FROM sales
GROUP BY 1
ORDER BY 1;
```

### 4.3 Filtros de Rango de Fecha
```sql
-- ❌ MAL (pierde el borde del día)
WHERE created_at >= '2026-02-11' AND created_at < '2026-02-12'

-- ✅ BIEN (convierte los límites del día chileno a UTC)
WHERE created_at >= '2026-02-11'::date AT TIME ZONE 'America/Santiago'
  AND created_at <  '2026-02-12'::date AT TIME ZONE 'America/Santiago'
```

### 4.4 Continuous Aggregates (TimescaleDB)
```sql
-- Los buckets deben respetar la zona horaria
SELECT time_bucket('1 day', created_at, 'America/Santiago') AS dia,
       SUM(total) as total_ventas
FROM sales
GROUP BY 1;
```

---

## 5. Configuración de Deploy

### 5.1 Vercel
En `vercel.json` o en las variables de entorno del proyecto:
```json
{
  "env": {
    "TZ": "America/Santiago"
  }
}
```

### 5.2 Docker
```dockerfile
ENV TZ=America/Santiago
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
```

### 5.3 Variables de Entorno (.env)
```
TZ=America/Santiago
```

> **NOTA:** Configurar `TZ` en el servidor es un respaldo útil, pero **NO** es suficiente por sí solo. Siempre usa las funciones de formateo explícitas. La variable `TZ` puede no ser respetada en entornos serverless.

---

## 6. Checklist de Validación

Antes de entregar código que involucre fechas:

- [ ] ¿Toda fecha visible en la UI usa `formatDateTimeCL()` o equivalente con `timeZone: 'America/Santiago'`?
- [ ] ¿Los tickets de impresión muestran hora Santiago?
- [ ] ¿Los CSVs/PDFs exportados tienen fechas en hora Santiago?
- [ ] ¿Las consultas SQL que agrupan por día usan `AT TIME ZONE 'America/Santiago'`?
- [ ] ¿El cierre de caja a las 23:59 Chile sigue siendo "hoy"? (En UTC ya sería "mañana")
- [ ] ¿Los reportes de asistencia reflejan la hora real de marca?
- [ ] ¿No hay `new Date().toLocaleString()` sin `timeZone` explícito?
- [ ] ¿No hay `toISOString()` en contextos visibles al usuario? (Solo aceptable para APIs internas)

---

## 7. Errores Comunes a Evitar

| ❌ Error | ✅ Corrección |
|----------|--------------|
| `new Date().toLocaleString()` | `formatDateTimeCL(new Date())` |
| `new Date().toISOString()` en UI | `formatDateTimeCL(new Date())` |
| `date_trunc('day', created_at)` en SQL | `date_trunc('day', created_at AT TIME ZONE 'America/Santiago')` |
| `moment().format()` sin timezone | Usar `Intl` con `timeZone: TIMEZONE` |
| Guardar `formatDateTimeCL()` en la DB | Guardar `new Date()` (UTC) en la DB |
| Comparar fechas con strings locales | Comparar timestamps UTC y convertir solo para display |
