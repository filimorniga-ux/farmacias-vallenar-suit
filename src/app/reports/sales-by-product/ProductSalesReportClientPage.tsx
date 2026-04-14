'use client';

import RouteGuard from '@/components/auth/RouteGuard';
import { ProductSalesReportPage } from '@/presentation/pages/reports/ProductSalesReportPage';

const PRODUCT_SALES_REPORT_ALLOWED_ROLES = [
    'MANAGER',
    'ADMIN',
    'GERENTE_GENERAL',
    'QF',
] as const;

export default function ProductSalesReportClientPage() {
    return (
        <RouteGuard allowedRoles={[...PRODUCT_SALES_REPORT_ALLOWED_ROLES]}>
            <ProductSalesReportPage />
        </RouteGuard>
    );
}
