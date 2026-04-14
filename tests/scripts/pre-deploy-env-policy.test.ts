import { describe, expect, it } from 'vitest';
import { evaluateEnvironmentPolicy, normalizeAppEnvironment } from '../../src/scripts/pre-deploy-env-policy';

describe('pre-deploy env policy', () => {
    it('normaliza APP_ENV solo a staging o production', () => {
        expect(normalizeAppEnvironment('staging')).toBe('staging');
        expect(normalizeAppEnvironment('production')).toBe('production');
        expect(normalizeAppEnvironment('preview')).toBe('unknown');
        expect(normalizeAppEnvironment(undefined)).toBe('unknown');
    });

    it('falla si VERCEL_ENV=production no coincide con APP_ENV=production', () => {
        const result = evaluateEnvironmentPolicy({
            appEnv: 'staging',
            vercelEnv: 'production',
            appUrl: 'https://staging.example.com',
            publicAppUrl: 'https://staging.example.com',
            databaseUrl: 'postgres://staging-db.example.com/app',
        });

        expect(result.errors).toContain('VERCEL_ENV=production exige APP_ENV=production.');
    });

    it('permite contexto de producción sintético en CI', () => {
        const result = evaluateEnvironmentPolicy({
            appEnv: 'production',
            vercelEnv: 'production',
            appUrl: 'https://ci.example.invalid',
            publicAppUrl: 'https://ci.example.invalid',
            databaseUrl: 'postgres://postgres@localhost:5432/farmacia_vallenar',
            ci: true,
        });

        expect(result.errors).toEqual([]);
        expect(result.isSyntheticProductionTarget).toBe(true);
    });

    it('falla en producción real si host o DB parecen de staging', () => {
        const result = evaluateEnvironmentPolicy({
            appEnv: 'production',
            vercelEnv: 'production',
            appUrl: 'https://staging.example.com',
            publicAppUrl: 'https://staging.example.com',
            databaseUrl: 'postgres://postgres@staging-db.internal/farmacia',
        });

        expect(result.errors).toContain('Producción real no debe usar hosts de staging/preview/local.');
        expect(result.errors).toContain('Producción real no debe apuntar a DATABASE_URL local, de staging o de pruebas.');
    });

    it('falla si APP_URL y NEXT_PUBLIC_APP_URL no coinciden', () => {
        const result = evaluateEnvironmentPolicy({
            appEnv: 'production',
            vercelEnv: 'production',
            appUrl: 'https://app.example.com',
            publicAppUrl: 'https://public.example.com',
            databaseUrl: 'postgres://db.example.com/app',
        });

        expect(result.errors).toContain('APP_URL y NEXT_PUBLIC_APP_URL deben apuntar al mismo origen.');
    });
});
