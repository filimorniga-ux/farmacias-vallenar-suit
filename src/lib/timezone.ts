/**
 * Constantes y helpers centralizados de zona horaria.
 * Skill: timezone-santiago — NUNCA usar 'America/Santiago' disperso en el código.
 *
 * Regla Cardinal: almacenamiento en UTC, conversión a Santiago solo en punto de salida.
 */

export const TIMEZONE = 'America/Santiago' as const;
export const LOCALE = 'es-CL' as const;

/** Fecha + hora completa: "11-02-2026 12:35:47" */
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

/** Solo fecha: "11-02-2026" */
export function formatDateCL(date: Date | number | string): string {
    return new Intl.DateTimeFormat(LOCALE, {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(date));
}

/** Solo hora: "12:35:47" */
export function formatTimeCL(date: Date | number | string): string {
    return new Intl.DateTimeFormat(LOCALE, {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(new Date(date));
}

/** "Hoy" en Santiago como YYYY-MM-DD (para filtros) */
export function getTodayCL(): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}
