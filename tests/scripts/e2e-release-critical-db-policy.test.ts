import { describe, expect, it } from 'vitest';
import {
    buildReleaseCriticalDbUnavailableMessage,
    buildReleaseCriticalGateEnv,
    getReleaseCriticalDbSuitabilityIssue,
    resolveReleaseCriticalGateDbTarget,
    RELEASE_CRITICAL_GATE_DEFAULTS,
} from '../../src/scripts/e2e-release-critical-db-policy';

describe('e2e release critical db policy', () => {
    it('prioriza POSTGRES_URL_NON_POOLING aunque existan DATABASE_URL o POSTGRES_URL', () => {
        const result = resolveReleaseCriticalGateDbTarget({
            DATABASE_URL: 'postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
            POSTGRES_URL: 'postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
            POSTGRES_URL_NON_POOLING: 'postgres://app:secret@db.example.com:5432/farmacia',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.target.source).toBe('POSTGRES_URL_NON_POOLING');
        expect(result.target.connectionString).toBe('postgres://app:secret@db.example.com:5432/farmacia');
        expect(result.target.usesFallback).toBe(false);
    });

    it('ignora DATABASE_URL y POSTGRES_URL en local cuando falta POSTGRES_URL_NON_POOLING', () => {
        const result = resolveReleaseCriticalGateDbTarget({
            CI: 'false',
            DATABASE_URL: 'postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
            POSTGRES_URL: 'postgres://app:secret@db.example.com:5432/farmacia',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.target.source).toBe('LOCAL_REHEARSAL_FALLBACK');
        expect(result.target.connectionString).toBe(RELEASE_CRITICAL_GATE_DEFAULTS.DEFAULT_LOCAL_REHEARSAL_DB_URL);
        expect(result.target.usesFallback).toBe(true);
    });

    it('permite fallback local solo fuera de CI', () => {
        const result = resolveReleaseCriticalGateDbTarget({
            CI: 'false',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.target.source).toBe('LOCAL_REHEARSAL_FALLBACK');
        expect(result.target.connectionString).toBe(RELEASE_CRITICAL_GATE_DEFAULTS.DEFAULT_LOCAL_REHEARSAL_DB_URL);
        expect(result.target.mode).toBe('local');
        expect(result.target.usesFallback).toBe(true);
    });

    it('falla temprano en CI si no existe una URL explícita', () => {
        const result = resolveReleaseCriticalGateDbTarget({
            CI: 'true',
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        expect(result.mode).toBe('ci');
        expect(result.errors).toContain('CI exige POSTGRES_URL_NON_POOLING configurada para el gate crítico.');
        expect(result.errors).toContain('DATABASE_URL y POSTGRES_URL se ignoran en este runner para evitar poolers o targets saturables por accidente.');
        expect(result.errors).toContain('El fallback localhost:55433 está deshabilitado en CI.');
    });

    it('construye un mensaje accionable para fallback local caído', () => {
        const resolution = resolveReleaseCriticalGateDbTarget({});
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) {
            return;
        }

        const message = buildReleaseCriticalDbUnavailableMessage(
            resolution.target,
            new Error('connect ECONNREFUSED 127.0.0.1:55433'),
        );

        expect(message).toContain('fallback local');
        expect(message).toContain('localhost:55433');
        expect(message).toContain('exporta POSTGRES_URL_NON_POOLING reachable');
    });

    it.each([
        [
            'host pooler.supabase.com',
            'postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres',
        ],
        [
            'pgbouncer=true',
            'postgresql://user:pass@db.example.com:6543/postgres?pgbouncer=true',
        ],
        [
            'connection_limit=1',
            'postgresql://user:pass@db.example.com:5432/postgres?connection_limit=1',
        ],
    ])('marca como no apta una POSTGRES_URL_NON_POOLING con %s', (signal, connectionString) => {
        const result = resolveReleaseCriticalGateDbTarget({
            POSTGRES_URL_NON_POOLING: connectionString,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        const issue = getReleaseCriticalDbSuitabilityIssue(result.target);
        expect(issue).toContain(signal);
        expect(issue).toContain('POSTGRES_URL_NON_POOLING');
    });

    it('sanea el entorno hijo para que seed y Playwright usen solo el target resuelto', () => {
        const result = resolveReleaseCriticalGateDbTarget({
            POSTGRES_URL_NON_POOLING: 'postgres://app:secret@db.example.com:5432/farmacia',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        const gateEnv = buildReleaseCriticalGateEnv({
            DATABASE_URL: 'postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
            POSTGRES_URL: 'postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
            POSTGRES_URL_NON_POOLING: result.target.connectionString,
            FORCE_COLOR: '1',
            NO_COLOR: '1',
        }, result.target);

        expect(gateEnv.DATABASE_URL).toBe(result.target.connectionString);
        expect(gateEnv.POSTGRES_URL).toBe(result.target.connectionString);
        expect(gateEnv.POSTGRES_URL_NON_POOLING).toBe(result.target.connectionString);
        expect(gateEnv.NO_COLOR).toBeUndefined();
        expect(gateEnv.FORCE_COLOR).toBeUndefined();
    });
});
