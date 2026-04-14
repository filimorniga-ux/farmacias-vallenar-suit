import React from 'react';
import { redirect } from 'next/navigation';
// V2: Funciones seguras
import { getLocationsSecure } from '@/actions/locations-v2';
import AnalyticsDashboard from '@/presentation/components/analytics/AnalyticsDashboard';
import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';
import { getValidatedSession } from '@/lib/server-session';
import { ANALYTICS_PAGE_ROLES } from '@/actions/admin-scope';

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

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Dashboard Financiero</h1>
                        <p className="text-slate-500">Visualización de ventas, caja y rendimiento.</p>
                    </div>
                    <SyncStatusBadge />
                </div>

                <AnalyticsDashboard initialLocations={locations} userRole={userRole} />
            </div>
        </div>
    );
}
