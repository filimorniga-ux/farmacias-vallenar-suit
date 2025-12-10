import { AuditLogViewer } from '@/presentation/components/admin/AuditLogViewer';

export default function AuditPage() {
    return (
        <div className="min-h-screen bg-gray-50 p-6 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Seguridad y Auditoría</h1>
                    <p className="text-gray-500 mt-2">Visor de eventos críticos y registros de seguridad del sistema.</p>
                </div>

                <AuditLogViewer />
            </div>
        </div>
    );
}
