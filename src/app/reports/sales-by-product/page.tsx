import { redirect } from 'next/navigation';
import { PRODUCT_REPORT_ROLES, requireReportActor } from '@/actions/report-scope';
import ProductSalesReportClientPage from './ProductSalesReportClientPage';

export const dynamic = 'force-dynamic';

export default async function ProductSalesReportRoutePage() {
    const auth = await requireReportActor(PRODUCT_REPORT_ROLES);
    if (!auth.success) {
        redirect('/');
    }

    return <ProductSalesReportClientPage />;
}
