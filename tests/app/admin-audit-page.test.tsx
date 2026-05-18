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
    AUDIT_VIEW_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    requireScopedActor: mocks.requireScopedActorMock,
}));

vi.mock('@/presentation/components/admin/AuditLogViewer', () => ({
    AuditLogViewer: () => <div>AuditLogViewer</div>,
}));

import AuditPage from '@/app/admin/audit/page';

describe('/app/admin/audit/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige si el rol no puede ver auditoría', async () => {
        mocks.requireScopedActorMock.mockResolvedValue({ success: false, error: 'Acceso denegado' });

        await expect(AuditPage()).rejects.toThrow('REDIRECT:/');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });

    it('monta el viewer solo para roles de auditoría', async () => {
        mocks.requireScopedActorMock.mockResolvedValue({
            success: true,
            actor: {
                userId: 'manager-1',
                role: 'MANAGER',
                userName: 'Manager',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        await expect(AuditPage()).resolves.toBeTruthy();

        expect(mocks.requireScopedActorMock).toHaveBeenCalledWith(['MANAGER', 'ADMIN', 'GERENTE_GENERAL']);
        expect(mocks.redirectMock).not.toHaveBeenCalled();
    });
});
