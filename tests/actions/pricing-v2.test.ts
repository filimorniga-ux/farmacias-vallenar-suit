/**
 * Tests para pricing-v2.ts - Módulo de Monitoreo de Costos y Precios
 */
import { describe, it, expect, vi } from 'vitest';

const { mockRequireScopedActor } = vi.hoisted(() => ({
    mockRequireScopedActor: vi.fn(),
}));

// Mock de dependencias
vi.mock('@/lib/db', () => ({
    pool: {
        query: vi.fn(),
        connect: vi.fn(),
    },
}));

vi.mock('@sentry/nextjs', () => ({
    captureMessage: vi.fn(),
    captureException: vi.fn(),
}));

// Mock de next/cache
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/actions/admin-scope', () => ({
    requireScopedActor: mockRequireScopedActor,
    PRICING_READ_ROLES: ['MANAGER', 'QF', 'ADMIN', 'GERENTE_GENERAL'],
    PRICING_GLOBAL_ROLES: ['QF', 'ADMIN', 'GERENTE_GENERAL'],
    PRICING_WRITE_ROLES: ['QF', 'ADMIN', 'GERENTE_GENERAL'],
    resolveEffectiveLocation: vi.fn(),
    hasGlobalScope: vi.fn(),
}));

describe('Pricing V2 - Cost Change Detection', () => {
    describe('recordCostChange', () => {
        it('should calculate change percent correctly for price increase', async () => {
            const { pool } = await import('@/lib/db');
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

            const { recordCostChange } = await import('@/actions/pricing-v2');

            await recordCostChange({
                productId: '123e4567-e89b-12d3-a456-426614174000',
                changeType: 'COST_CHANGE',
                fieldChanged: 'cost_net',
                oldValue: 1000,
                newValue: 1300,
                source: 'RECEPTION',
            });

            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO price_cost_history'),
                expect.arrayContaining([
                    '123e4567-e89b-12d3-a456-426614174000', // productId
                    null, // batchId
                    'COST_CHANGE', // changeType
                    'cost_net', // fieldChanged
                    1000, // oldValue
                    1300, // newValue
                    30, // changePercent ((1300-1000)/1000)*100
                    'RECEPTION', // source
                ])
            );
        });

        it('should handle zero old value correctly', async () => {
            const { pool } = await import('@/lib/db');
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

            const { recordCostChange } = await import('@/actions/pricing-v2');

            await recordCostChange({
                productId: '123e4567-e89b-12d3-a456-426614174000',
                changeType: 'COST_CHANGE',
                fieldChanged: 'cost_net',
                oldValue: 0,
                newValue: 500,
                source: 'RECEPTION',
            });

            // When old value is 0, changePercent should be 100
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO price_cost_history'),
                expect.arrayContaining([100]) // 100% change from zero
            );
        });

        it('should calculate negative change percent for price decrease', async () => {
            const { pool } = await import('@/lib/db');
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

            const { recordCostChange } = await import('@/actions/pricing-v2');

            await recordCostChange({
                productId: '123e4567-e89b-12d3-a456-426614174000',
                changeType: 'COST_CHANGE',
                fieldChanged: 'cost_net',
                oldValue: 1000,
                newValue: 800,
                source: 'RECEPTION',
            });

            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO price_cost_history'),
                expect.arrayContaining([-20]) // -20% change
            );
        });
    });

    describe('generateMissingCosts', () => {
        it('should reject unauthorized actors before touching the database', async () => {
            const { pool } = await import('@/lib/db');
            const { generateMissingCosts } = await import('@/actions/pricing-v2');
            (pool.query as ReturnType<typeof vi.fn>).mockClear();
            mockRequireScopedActor.mockResolvedValueOnce({
                success: false,
                error: 'Acceso denegado',
            });

            const result = await generateMissingCosts();

            expect(result).toEqual({
                success: false,
                error: 'Acceso denegado',
            });
            expect(pool.query).not.toHaveBeenCalled();
        });

        it('should calculate cost from sale price with 30% margin', () => {
            // costo = precio_venta / 1.30
            const salePrice = 10000;
            const margin = 0.30;
            const estimatedCost = Math.round(salePrice / (1 + margin));

            expect(estimatedCost).toBe(7692); // $10,000 / 1.30 = $7,692
        });

        it('should calculate cost from sale price with 25% margin', () => {
            const salePrice = 5000;
            const margin = 0.25;
            const estimatedCost = Math.round(salePrice / (1 + margin));

            expect(estimatedCost).toBe(4000); // $5,000 / 1.25 = $4,000
        });

        it('should round cost to nearest integer', () => {
            const salePrice = 3333;
            const margin = 0.30;
            const estimatedCost = Math.round(salePrice / (1 + margin));

            expect(estimatedCost).toBe(2564); // $3,333 / 1.30 = $2,564
            expect(Number.isInteger(estimatedCost)).toBe(true);
        });
    });

    describe('FEFO Order Logic', () => {
        it('should sort batches by expiry date ascending (FEFO)', () => {
            const batches = [
                { lot: 'A', expiry: '2026-12-01', qty: 5 },
                { lot: 'B', expiry: '2026-06-15', qty: 10 },
                { lot: 'C', expiry: '2026-03-20', qty: 3 },
                { lot: 'D', expiry: null, qty: 8 },
            ];

            const sorted = [...batches].sort((a, b) => {
                if (!a.expiry && !b.expiry) return 0;
                if (!a.expiry) return 1; // null goes last
                if (!b.expiry) return -1;
                return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
            });

            expect(sorted[0].lot).toBe('C'); // Expires first (Mar 2026)
            expect(sorted[1].lot).toBe('B'); // Jun 2026
            expect(sorted[2].lot).toBe('A'); // Dec 2026
            expect(sorted[3].lot).toBe('D'); // No expiry — last
        });

        it('should flag batches expiring within 90 days as priority', () => {
            const now = new Date();
            const batchExpiry = new Date(now.getTime() + (60 * 24 * 60 * 60 * 1000)); // 60 days from now

            const daysUntilExpiry = Math.floor(
                (batchExpiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
            );

            const isPriority = daysUntilExpiry < 90;
            expect(isPriority).toBe(true);
            expect(daysUntilExpiry).toBeGreaterThanOrEqual(59);
            expect(daysUntilExpiry).toBeLessThanOrEqual(61);
        });
    });
});
