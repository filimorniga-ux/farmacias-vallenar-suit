import { redirect } from 'next/navigation';
import { ANALYTICS_PAGE_ROLES } from '@/actions/admin-scope';
import { getValidatedSession } from '@/lib/server-session';
import ExecutiveDashboard from '@/presentation/components/analytics/ExecutiveDashboard';

export const dynamic = 'force-dynamic';

export default async function ManagerDashboardPage() {
    const session = await getValidatedSession();
    const role = String(session?.role || '').trim().toUpperCase();

    if (!session || !ANALYTICS_PAGE_ROLES.includes(role as typeof ANALYTICS_PAGE_ROLES[number])) {
        redirect('/');
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard Ejecutivo</h1>
                    <p className="text-slate-500">
                        Vista consolidada del contrato ejecutivo canónico, sin acciones paralelas.
                    </p>
                </div>

                <ExecutiveDashboard />
            </div>
        </div>
    );
}
