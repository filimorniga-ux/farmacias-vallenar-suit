import { AuditLogViewer } from '@/presentation/components/admin/AuditLogViewer';

export const dynamic = 'force-dynamic';

export default function AuditPage() {
    return (
        <div className="p-8 max-w-6xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-slate-900">Centro de Seguridad</h1>
            <AuditLogViewer />
        </div>
    );
}
