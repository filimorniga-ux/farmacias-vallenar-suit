import { describe, expect, it } from 'vitest';
import {
    formatChileanRutInput,
    isCompleteChileanRutInput,
    normalizeChileanRutInput,
} from '@/lib/chile-rut';

describe('chile-rut input helpers', () => {
    it('normaliza caracteres permitidos y limita el largo usable', () => {
        expect(normalizeChileanRutInput(' 12.345.678-k ')).toBe('12345678K');
        expect(normalizeChileanRutInput('abc22.222.222-2xyz')).toBe('222222222');
    });

    it('formatea RUT completo con puntos y guion mientras se escribe', () => {
        expect(formatChileanRutInput('22222222')).toBe('2.222.222-2');
        expect(formatChileanRutInput('222222222')).toBe('22.222.222-2');
        expect(formatChileanRutInput('12345678k')).toBe('12.345.678-K');
    });

    it('mantiene entradas parciales editables antes de agregar el guion', () => {
        expect(formatChileanRutInput('')).toBe('');
        expect(formatChileanRutInput('2')).toBe('2');
        expect(formatChileanRutInput('2222')).toBe('2.222');
        expect(formatChileanRutInput('2222222')).toBe('2.222.222');
    });

    it('solo considera completo un RUT con cuerpo y digito verificador', () => {
        expect(isCompleteChileanRutInput('2.222.222')).toBe(false);
        expect(isCompleteChileanRutInput('2.222.222-2')).toBe(true);
        expect(isCompleteChileanRutInput('22.222.222-2')).toBe(true);
    });
});
