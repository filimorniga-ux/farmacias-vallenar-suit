
import React from 'react';
// V2: Funciones seguras
import { getLocationsSecure } from '@/actions/locations-v2';
import AnalyticsDashboard from '@/presentation/components/analytics/AnalyticsDashboard';

import { SyncStatusBadge } from '@/presentation/components/ui/SyncStatusBadge';
import { getValidatedSession } from '@/lib/server-session';

export default async function AnalyticsPage() {
    const session = await getValidatedSession();
    const userRole = session?.role || 'CASHIER';

    const locationsRes = await getLocationsSecure();
    const locations = locationsRes.success && locationsRes.data ? locationsRes.data.filter((l: any) => l.type === 'STORE' || l.type === 'HQ') : [];

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
