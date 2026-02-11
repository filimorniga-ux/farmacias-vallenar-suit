import { useState, useEffect } from 'react';
import { TIMEZONE, LOCALE } from '@/lib/timezone';

interface ChileClockData {
    /** Hora formateada "12:35:47" */
    time: string;
    /** Fecha corta "11 feb. 2026" */
    date: string;
    /** Nombre del día "martes" */
    dayName: string;
    /** Fecha completa "mar. 11 feb. 2026" */
    fullDate: string;
}

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

const dayFormatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    weekday: 'long',
});

const fullDateFormatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

function getClockData(): ChileClockData {
    const now = new Date();
    return {
        time: timeFormatter.format(now),
        date: dateFormatter.format(now),
        dayName: dayFormatter.format(now),
        fullDate: fullDateFormatter.format(now),
    };
}

/**
 * Hook que devuelve fecha y hora de Santiago actualizada cada segundo.
 * Usa Intl.DateTimeFormat con timeZone: 'America/Santiago'.
 */
export function useChileClock(): ChileClockData {
    const [clock, setClock] = useState<ChileClockData>(getClockData);

    useEffect(() => {
        const interval = setInterval(() => {
            setClock(getClockData());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return clock;
}
