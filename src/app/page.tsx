import ClientApp from '../components/ClientApp';
import { cookies } from 'next/headers';

export default async function Page() {
    const cookieStore = await cookies();
    const hasLocation = cookieStore.has('preferred_location_id');

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <ClientApp forceContextSelection={!hasLocation} />
        </div>
    );
}
