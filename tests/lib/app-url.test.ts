import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAppUrl, resolveAppUrl } from '@/lib/app-url';

describe('app-url helpers', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('prioriza APP_URL sobre aliases legacy', () => {
        vi.stubEnv('APP_URL', 'https://app.example.com');
        vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://public.example.com');
        vi.stubEnv('BASE_URL', 'https://legacy.example.com');

        expect(resolveAppUrl()).toBe('https://app.example.com/');
    });

    it('mantiene compatibilidad con aliases legacy mientras se limpian', () => {
        vi.stubEnv('APP_URL', '');
        vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
        vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://legacy.example.com');

        expect(resolveAppUrl()).toBe('https://legacy.example.com/');
    });

    it('falla en producción si no hay APP_URL resoluble', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('APP_URL', '');
        vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
        vi.stubEnv('BASE_URL', '');
        vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
        vi.stubEnv('PUBLIC_APP_URL', '');

        expect(() => requireAppUrl()).toThrow('APP_URL es obligatoria en producción');
    });
});
