import { describe, expect, it } from 'vitest';
import { DB_POOL_DEFAULTS, resolveDbPoolMax } from '@/lib/db-config';

describe('db-config', () => {
    it('respeta connection_limit en URLs con pgbouncer', () => {
        expect(
            resolveDbPoolMax(
                'postgresql://user:pass@host:6543/postgres?pgbouncer=true&connection_limit=1',
            ),
        ).toBe(1);
    });

    it('usa fallback conservador para pooler remoto sin connection_limit explícito', () => {
        expect(
            resolveDbPoolMax(
                'postgresql://user:pass@host:6543/postgres?pgbouncer=true',
            ),
        ).toBe(DB_POOL_DEFAULTS.POOLED_DB_FALLBACK_MAX);
    });

    it('mantiene el tamaño por defecto fuera de URLs pooler', () => {
        expect(
            resolveDbPoolMax(
                'postgresql://user:pass@localhost:5432/farmacia',
            ),
        ).toBe(DB_POOL_DEFAULTS.DEFAULT_DB_POOL_MAX);
    });
});
