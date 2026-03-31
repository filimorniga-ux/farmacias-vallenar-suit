import ClientApp from '@/components/ClientApp';
import { cookies } from 'next/headers';

export default async function LegacyClientAppPage() {
    let hasLocation = false;
    let error = null;

    try {
        const cookieStore = await cookies();
        hasLocation = cookieStore.has('preferred_location_id');
    } catch (e) {
        console.error('CRITICAL ERROR in Legacy Client App Page:', e);
        error = e;
    }

    if (error) {
        return (
            <div className="min-h-screen bg-red-50 flex items-center justify-center">
                <div className="p-8 bg-white rounded-xl shadow-xl text-center">
                    <h1 className="text-red-600 font-bold mb-2">Error de Servidor</h1>
                    <p className="text-sm text-slate-600 mb-4">No se pudo verificar la sesión.</p>
                    <ClientApp forceContextSelection={true} />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <ClientApp forceContextSelection={!hasLocation} />
        </div>
    );
}
