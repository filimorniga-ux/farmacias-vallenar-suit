'use client';

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import RouteGuard from '@/components/auth/RouteGuard';
import { SupplierProfile } from '@/presentation/pages/SupplierProfile';
import { SuppliersPage } from '@/presentation/pages/SuppliersPage';

const SUPPLIERS_ALLOWED_ROLES = [
    'MANAGER',
    'QF',
    'WAREHOUSE',
    'WAREHOUSE_CHIEF',
    'ADMIN',
    'GERENTE_GENERAL',
] as const;

export default function SuppliersClientPage() {
    return (
        <RouteGuard allowedRoles={[...SUPPLIERS_ALLOWED_ROLES]}>
            <BrowserRouter>
                <Routes>
                    <Route path="/suppliers" element={<SuppliersPage />} />
                    <Route path="/suppliers/:id" element={<SupplierProfile />} />
                    <Route path="*" element={<Navigate to="/suppliers" replace />} />
                </Routes>
            </BrowserRouter>
        </RouteGuard>
    );
}
