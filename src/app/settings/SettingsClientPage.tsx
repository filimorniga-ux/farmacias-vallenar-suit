'use client';

import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import RouteGuard from '@/components/auth/RouteGuard';
import SettingsPage from '@/presentation/pages/SettingsPage';

const SETTINGS_ALLOWED_ROLES = ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'] as const;

export default function SettingsClientPage() {
    return (
        <RouteGuard allowedRoles={[...SETTINGS_ALLOWED_ROLES]}>
            <BrowserRouter>
                <Suspense fallback={<div className="p-6 text-sm text-slate-500">Cargando configuración...</div>}>
                    <SettingsPage />
                </Suspense>
            </BrowserRouter>
        </RouteGuard>
    );
}
