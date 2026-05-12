import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import PosLayout from '@/app/pos/layout';
import CajaLayout from '@/app/caja/layout';

const allowedSession = {
    userId: 'cashier-1',
    role: 'CASHIER',
    locationId: 'loc-1',
    userName: 'Caja',
    tokenVersion: 1,
    sessionToken: 'token',
};

describe('POS/caja App Router access', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirige /pos a login sin sesión antes de montar el cliente POS', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(PosLayout({ children: <div>POS</div> })).rejects.toThrow('REDIRECT:/login');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
    });

    it('redirige /caja a login sin sesión antes de montar el cliente POS', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(CajaLayout({ children: <div>Caja</div> })).rejects.toThrow('REDIRECT:/login');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
    });

    it('permite /pos y /caja a roles POS autorizados', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(allowedSession);

        await expect(PosLayout({ children: <div>POS</div> })).resolves.toBeTruthy();
        await expect(CajaLayout({ children: <div>Caja</div> })).resolves.toBeTruthy();

        expect(mocks.redirectMock).not.toHaveBeenCalled();
    });

    it('bloquea /pos para roles internos que no son de caja', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            ...allowedSession,
            role: 'WAREHOUSE',
        });

        await expect(PosLayout({ children: <div>POS</div> })).rejects.toThrow('REDIRECT:/');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/');
    });
});
