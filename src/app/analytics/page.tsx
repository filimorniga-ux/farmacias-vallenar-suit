import React from 'react';
import { redirect } from 'next/navigation';
// V2: Funciones seguras
import { getLocationsSecure } from '@/actions/locations-v2';
import AnalyticsDashboard from '@/presentation/components/analytics/AnalyticsDashboard';
import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';
import { getValidatedSession } from '@/lib/server-session';
import { ANALYTICS_PAGE_ROLES } from '@/actions/admin-scope';
import { getOperationalKpiOverviewSecure } from '@/actions/analytics/operational-kpis';
import { getOperationalSuggestionsSecure } from '@/actions/analytics/operational-suggestions';
import { getOperationalInsightsSecure } from '@/actions/analytics/operational-insights';

function santiagoDateInput(date: Date) {
    const parts = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value ?? String(date.getFullYear());
    const month = parts.find((part) => part.type === 'month')?.value ?? String(date.getMonth() + 1).padStart(2, '0');
    const day = parts.find((part) => part.type === 'day')?.value ?? String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export default async function AnalyticsPage() {
    const session = await getValidatedSession();
    const userRole = session?.role || 'CASHIER';

    if (!session || !ANALYTICS_PAGE_ROLES.includes(String(userRole).trim().toUpperCase() as typeof ANALYTICS_PAGE_ROLES[number])) {
        redirect('/');
    }

    const locationsRes = await getLocationsSecure();
    const scopedLocations = locationsRes.success && locationsRes.data
        ? locationsRes.data.filter((l: any) => l.type === 'STORE' || l.type === 'HQ')
        : [];
    const locations = String(userRole).trim().toUpperCase() === 'MANAGER'
        ? scopedLocations.filter((location: any) => location.id === session.locationId)
        : scopedLocations;
    const today = santiagoDateInput(new Date());
    const initialFilters = {
        startDate: today,
        endDate: today,
        locationId: String(userRole).trim().toUpperCase() === 'MANAGER' ? session.locationId : undefined,
        granularity: 'day' as const,
    };
    const [initialOverview, initialSuggestions, initialInsights] = await Promise.all([
        getOperationalKpiOverviewSecure(initialFilters),
        getOperationalSuggestionsSecure(initialFilters),
        getOperationalInsightsSecure(initialFilters),
    ]);

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Dashboard Operativo</h1>
                        <p className="text-slate-500">KPIs confiables para decidir rápido, sin métricas estimadas.</p>
                    </div>
                    <SyncStatusBadge />
                </div>

                <AnalyticsDashboard
                    initialLocations={locations}
                    userRole={userRole}
                    initialFilters={initialFilters}
                    initialOverview={initialOverview}
                    initialSuggestions={initialSuggestions}
                    initialInsights={initialInsights}
                />
            </div>
        </div>
    );
}
