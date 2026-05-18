import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfigEncryptionKey } from '@/lib/config-encryption';

describe('getConfigEncryptionKey', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('falla en producción si falta CONFIG_ENCRYPTION_KEY', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('CONFIG_ENCRYPTION_KEY', '');
        vi.stubEnv('DATABASE_URL', '');

        expect(() => getConfigEncryptionKey()).toThrow('CONFIG_ENCRYPTION_KEY es obligatoria en producción');
    });

    it('usa fallback controlado fuera de producción', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('CONFIG_ENCRYPTION_KEY', '');
        vi.stubEnv('DATABASE_URL', 'postgres://local/test');

        const key = getConfigEncryptionKey();
        expect(key).toBeInstanceOf(Buffer);
        expect(key).toHaveLength(32);
    });

    it('prioriza la clave configurada cuando existe', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('CONFIG_ENCRYPTION_KEY', 'a'.repeat(64));

        const key = getConfigEncryptionKey();
        expect(key.toString('hex')).toBe('a'.repeat(64));
    });
});
