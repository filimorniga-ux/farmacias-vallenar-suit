import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getValidatedSessionMock: vi.fn(),
    getDashboardStatsMock: vi.fn(),
    getManagerRealTimeDataForActorMock: vi.fn(),
    redirectMock: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mocks.redirectMock(url),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: mocks.getValidatedSessionMock,
}));

vi.mock('@/actions/analytics/dashboard-stats', () => ({
    getDashboardStats: mocks.getDashboardStatsMock,
}));

vi.mock('@/actions/manager-dashboard-v2', () => ({
    getManagerRealTimeDataForActor: mocks.getManagerRealTimeDataForActorMock,
}));

vi.mock('@/app/dashboard/DashboardClientPage', () => ({
    __esModule: true,
    default: ({
        initialDashboardStats,
        initialManagerData,
    }: {
        initialDashboardStats: unknown;
        initialManagerData: unknown;
    }) => (
        <div
            data-testid="dashboard-client-page"
            data-dashboard={JSON.stringify(initialDashboardStats)}
            data-manager={JSON.stringify(initialManagerData)}
        />
    ),
}));

import DashboardPage from '@/app/dashboard/page';

describe('/app/dashboard/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDashboardStatsMock.mockResolvedValue({ salesToday: 10 });
    });

    it('redirige a login sin sesión y no lee datos antes del boundary server-side', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue(null);

        await expect(DashboardPage()).rejects.toThrow('NEXT_REDIRECT');

        expect(mocks.redirectMock).toHaveBeenCalledWith('/login');
        expect(mocks.getDashboardStatsMock).not.toHaveBeenCalled();
        expect(mocks.getManagerRealTimeDataForActorMock).not.toHaveBeenCalled();
    });

    it('reutiliza la sesión validada para cargar dashboard gerencial sin revalidación adicional', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'manager-1',
            role: 'manager',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 3,
            sessionToken: 'token-1',
        });
        mocks.getManagerRealTimeDataForActorMock.mockResolvedValue({
            success: true,
            data: { branches: [] },
        });

        const page = await DashboardPage();
        const rendered = JSON.stringify(page);

        expect(mocks.getValidatedSessionMock).toHaveBeenCalledTimes(1);
        expect(mocks.getDashboardStatsMock).toHaveBeenCalledTimes(1);
        expect(mocks.getManagerRealTimeDataForActorMock).toHaveBeenCalledTimes(1);
        expect(mocks.getManagerRealTimeDataForActorMock).toHaveBeenCalledWith({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager',
            tokenVersion: 3,
            sessionToken: 'token-1',
        });
        expect(rendered).toContain('salesToday');
        expect(rendered).toContain('branches');
    });

    it('omite el dashboard gerencial si la sesión no pertenece a un rol manager', async () => {
        mocks.getValidatedSessionMock.mockResolvedValue({
            userId: 'cashier-1',
            role: 'cashier',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token-2',
        });

        await DashboardPage();

        expect(mocks.getValidatedSessionMock).toHaveBeenCalledTimes(1);
        expect(mocks.getDashboardStatsMock).toHaveBeenCalledTimes(1);
        expect(mocks.getManagerRealTimeDataForActorMock).not.toHaveBeenCalled();
    });
});
