import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetValidatedSession,
    mockRedirect,
    mockGetLocationsSecure,
    mockGetOperationalKpiOverviewSecure,
    mockGetOperationalSuggestionsSecure,
    mockGetOperationalInsightsSecure,
} = vi.hoisted(() => ({
    mockGetValidatedSession: vi.fn(),
    mockRedirect: vi.fn((_: string) => {
        throw new Error('NEXT_REDIRECT');
    }),
    mockGetLocationsSecure: vi.fn(),
    mockGetOperationalKpiOverviewSecure: vi.fn(),
    mockGetOperationalSuggestionsSecure: vi.fn(),
    mockGetOperationalInsightsSecure: vi.fn(),
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

vi.mock('@/actions/analytics/operational-kpis', () => ({
    getOperationalKpiOverviewSecure: (filters: unknown) => mockGetOperationalKpiOverviewSecure(filters),
}));

vi.mock('@/actions/analytics/operational-suggestions', () => ({
    getOperationalSuggestionsSecure: (filters: unknown) => mockGetOperationalSuggestionsSecure(filters),
}));

vi.mock('@/actions/analytics/operational-insights', () => ({
    getOperationalInsightsSecure: (filters: unknown) => mockGetOperationalInsightsSecure(filters),
}));

vi.mock('@/presentation/components/analytics/AnalyticsDashboard', () => ({
    __esModule: true,
    default: ({
        initialLocations,
        userRole,
        initialFilters,
        initialSuggestions,
        initialInsights,
    }: {
        initialLocations: Array<{ id: string }>;
        userRole: string;
        initialFilters: { locationId?: string };
        initialSuggestions: { success: boolean };
        initialInsights: { success: boolean };
    }) => (
        <div
            data-testid="analytics-dashboard"
            data-role={userRole}
            data-locations={JSON.stringify(initialLocations)}
            data-location={initialFilters.locationId || ''}
            data-suggestions={String(initialSuggestions.success)}
            data-insights={String(initialInsights.success)}
        />
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
        mockGetOperationalKpiOverviewSecure.mockResolvedValue({
            success: true,
            data: {
                scope: { startDate: '2026-04-19', endDate: '2026-04-19', granularity: 'day' },
                sales: { netSales: 0, ticketCount: 0, averageTicket: 0, topProducts: [] },
                cash: { openSessions: 0, closedSessions: 0, longOpenSessions: 0 },
                inventory: { criticalLowStockCount: 0, criticalItems: [] },
                procurement: { openPurchaseOrders: 0, byStatus: [] },
                wms: { pendingTransfers: 0, pendingInboundShipments: 0 },
            },
        });
        mockGetOperationalSuggestionsSecure.mockResolvedValue({
            success: true,
            data: {
                scope: { startDate: '2026-04-19', endDate: '2026-04-19', granularity: 'day' },
                generatedAt: '2026-04-19T12:00:00.000Z',
                alerts: [],
                alertExclusions: [],
                suggestions: [],
                suggestionsByAlertId: {},
                rankedAlertIds: [],
                suppressedSuggestionIds: [],
                blockedQuickActions: [],
                exclusions: [],
            },
        });
        mockGetOperationalInsightsSecure.mockResolvedValue({
            success: true,
            data: {
                scope: { startDate: '2026-04-19', endDate: '2026-04-19', granularity: 'day' },
                generatedAt: '2026-04-19T12:00:00.000Z',
                signalSource: 'quick-action-tuning-baseline',
                topUsefulActions: [],
                frictionSignals: [],
                operationalOpportunities: [],
                insights: [],
                executiveSummary: [],
                exclusions: [],
            },
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
        expect(mockGetOperationalKpiOverviewSecure).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'loc-2' }));
        expect(mockGetOperationalSuggestionsSecure).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'loc-2' }));
        expect(mockGetOperationalInsightsSecure).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'loc-2' }));
        expect(rendered).toContain('loc-2');
        expect(rendered).not.toContain('loc-1');
        expect(rendered).not.toContain('loc-hq');
    });
});
