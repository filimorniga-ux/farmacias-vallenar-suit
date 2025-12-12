
import React from 'react';
import OrganizationManager from '../../../presentation/components/settings/OrganizationManager';

export default async function OrganizationSettingsPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Configuración de Organización</h1>
            <p className="text-slate-500 mb-8">Gestione sucursales, bodegas, terminales y personal.</p>

            <OrganizationManager />
        </div>
    );
}
