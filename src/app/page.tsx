import PublicEntryClientPage from './PublicEntryClientPage';
import { cookies } from 'next/headers';

// Force Rebuild
export const dynamic = 'force-dynamic';

export default async function Page() {
    let hasLocation = false;

    try {
        const cookieStore = await cookies();
        hasLocation = cookieStore.has('preferred_location_id');
    } catch (e) {
        console.error('CRITICAL ERROR in Root Page:', e);
    }

    return <PublicEntryClientPage forceContextSelection={!hasLocation} />;
}
