import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRedirect } = vi.hoisted(() => ({
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

import FinanzasPage from '@/app/finanzas/page';
import TreasuryDashboardPage from '@/app/treasury/dashboard/page';

describe('legacy financial entrypoints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige /finanzas al dashboard canónico antes de leer datos financieros legacy', async () => {
        expect(() => FinanzasPage()).toThrow('NEXT_REDIRECT');
        expect(mockRedirect).toHaveBeenCalledWith('/analytics');
    });

    it('redirige /treasury/dashboard a tesorería canónica antes de exponer forecast legacy', async () => {
        expect(() => TreasuryDashboardPage()).toThrow('NEXT_REDIRECT');
        expect(mockRedirect).toHaveBeenCalledWith('/finance/treasury');
    });
});
