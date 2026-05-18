import { redirect } from 'next/navigation';

import { AUDIT_VIEW_ROLES, requireScopedActor } from '@/actions/admin-scope';
import { AuditLogViewer } from '@/presentation/components/admin/AuditLogViewer';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
    const auth = await requireScopedActor(AUDIT_VIEW_ROLES);
    if (!auth.success) {
        redirect('/');
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">Centro de Seguridad</h1>
            <AuditLogViewer />
        </div>
    );
}
