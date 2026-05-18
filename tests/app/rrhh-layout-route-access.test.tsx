import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getValidatedSessionMock: vi.fn(),
    redirectMock: vi.fn((path: string) => {
        throw new Error(`REDIRECT:${path}`);
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (path: string) => mocks.redirectMock(path),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: mocks.getValidatedSessionMock,
}));

vi.mock('@/presentation/layouts/NextSidebarLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

import RRHHLayout from '@/app/rrhh/layout';

describe('RRHH App Router layout access', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige a login sin sesión antes de montar RRHH', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(RRHHLayout({ children: <div>RRHH</div> })).rejects.toThrow('REDIRECT:/login');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
    });

    it('bloquea roles que no pueden entrar a RRHH', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        await expect(RRHHLayout({ children: <div>RRHH</div> })).rejects.toThrow('REDIRECT:/');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });

    it('permite roles autorizados de RRHH', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'rrhh-1',
            role: 'RRHH',
            locationId: 'loc-1',
            userName: 'RRHH',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        await expect(RRHHLayout({ children: <div>RRHH</div> })).resolves.toBeTruthy();

        expect(mocks.redirectMock).not.toHaveBeenCalled();
    });
});
