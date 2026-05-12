import { redirect } from 'next/navigation';
import { REPORTS_PAGE_ROLES, requireReportActor } from '@/actions/report-scope';
import ReportsClientPage from './ReportsClientPage';

export const dynamic = 'force-dynamic';

export default async function ReportsRoutePage() {
    const auth = await requireReportActor(REPORTS_PAGE_ROLES);
    if (!auth.success) {
        redirect('/');
    }

    return <ReportsClientPage />;
}
