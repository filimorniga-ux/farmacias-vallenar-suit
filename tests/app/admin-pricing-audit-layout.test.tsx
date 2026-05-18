import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireScopedActorMock: vi.fn(),
    redirectMock: vi.fn((path: string) => {
        throw new Error(`REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (path: string) => mocks.redirectMock(path),
}));

vi.mock('@/actions/admin-scope', () => ({
    PRICING_GLOBAL_ROLES: ['QF', 'ADMIN', 'GERENTE_GENERAL'],
    requireScopedActor: mocks.requireScopedActorMock,
}));

import PricingAuditLayout from '@/app/admin/pricing-audit/layout';

describe('/app/admin/pricing-audit/layout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige si el actor no tiene rol global de pricing', async () => {
        mocks.requireScopedActorMock.mockResolvedValue({ success: false, error: 'Acceso denegado' });

        await expect(PricingAuditLayout({ children: <div>Pricing audit</div> })).rejects.toThrow('REDIRECT:/');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });

    it('permite roles globales de pricing', async () => {
        mocks.requireScopedActorMock.mockResolvedValue({
            success: true,
            actor: {
                userId: 'qf-1',
                role: 'QF',
                userName: 'QF',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        await expect(PricingAuditLayout({ children: <div>Pricing audit</div> })).resolves.toBeTruthy();

        expect(mocks.requireScopedActorMock).toHaveBeenCalledWith(['QF', 'ADMIN', 'GERENTE_GENERAL']);
        expect(mocks.redirectMock).not.toHaveBeenCalled();
    });
});
