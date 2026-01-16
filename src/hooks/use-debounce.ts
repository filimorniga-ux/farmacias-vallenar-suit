import { useEffect, useState } from 'react';

/**
 * Hook para debouncing de valores.
 * Útil para búsquedas en tiempo real para evitar exceso de peticiones.
 * @param value Valor a observar
 * @param delay Retardo en milisegundos (default 500ms)
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}
