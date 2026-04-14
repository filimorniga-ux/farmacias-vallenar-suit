import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetValidatedSession,
    mockRedirect,
    mockGetLocationsSecure,
} = vi.hoisted(() => ({
    mockGetValidatedSession: vi.fn(),
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
    mockGetLocationsSecure: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: () => mockGetValidatedSession(),
}));

vi.mock('@/actions/locations-v2', () => ({
    getLocationsSecure: () => mockGetLocationsSecure(),
}));

vi.mock('@/presentation/components/analytics/AnalyticsDashboard', () => ({
    __esModule: true,
    default: ({ initialLocations, userRole }: { initialLocations: Array<{ id: string }>; userRole: string }) => (
        <div data-testid="analytics-dashboard" data-role={userRole} data-locations={JSON.stringify(initialLocations)} />
    ),
}));

vi.mock('@/presentation/components/ui/SyncStatusBadge', () => ({
    SyncStatusBadge: () => <div data-testid="sync-status" />,
}));

import AnalyticsPage from '@/app/analytics/page';

describe('/app/analytics/page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetLocationsSecure.mockResolvedValue({
            success: true,
            data: [
                { id: 'loc-1', type: 'STORE', name: 'Sucursal 1' },
                { id: 'loc-2', type: 'STORE', name: 'Sucursal 2' },
                { id: 'loc-hq', type: 'HQ', name: 'Casa Matriz' },
            ],
        });
    });

    it('redirige si no hay sesión válida', async () => {
        mockGetValidatedSession.mockResolvedValue(null);

        await expect(AnalyticsPage()).rejects.toThrow('NEXT_REDIRECT');
        expect(mockGetLocationsSecure).not.toHaveBeenCalled();
    });

    it('limita managers a su sucursal efectiva', async () => {
        mockGetValidatedSession.mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-2',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const page = await AnalyticsPage();
        const rendered = JSON.stringify(page);

        expect(mockGetLocationsSecure).toHaveBeenCalled();
        expect(rendered).toContain('loc-2');
        expect(rendered).not.toContain('loc-1');
        expect(rendered).not.toContain('loc-hq');
    });
});
