'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { ReconciliationModal } from './ReconciliationModal';
import { scheduleIdleTask } from '@/presentation/lib/scheduleIdleTask';
import { useSystemIncidents, type SystemIncident } from '@/presentation/hooks/useSystemIncidents';

const INCIDENTS_BANNER_DELAY_MS = 4000;
const INCIDENT_MANAGER_ROLES = new Set(['ADMIN', 'MANAGER', 'GERENTE_GENERAL']);

export default function SystemIncidentsBanner() {
    const user = usePharmaStore((state) => state.user);
    const [shouldFetchIncidents, setShouldFetchIncidents] = useState(false);
    const canManageIncidents = INCIDENT_MANAGER_ROLES.has(String(user?.role || '').toUpperCase());
    const {
        data: incidents = [],
        isLoading,
        refetch,
    } = useSystemIncidents(canManageIncidents && shouldFetchIncidents);

    const [selectedIncident, setSelectedIncident] = useState<SystemIncident | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        if (!canManageIncidents) {
            setShouldFetchIncidents(false);
            return;
        }

        const cancelDeferredFetch = scheduleIdleTask(() => {
            setShouldFetchIncidents(true);
        }, INCIDENTS_BANNER_DELAY_MS);

        return () => {
            cancelDeferredFetch();
        };
    }, [canManageIncidents]);

    const handleReconcileClick = (incident: SystemIncident) => {
        setSelectedIncident(incident);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedIncident(null);
        void refetch();
    };

    if (!canManageIncidents || isLoading || incidents.length === 0) return null;

    const targetIncident = incidents[0];

    return (
        <>
            <div className="mb-8 animate-in slide-in-from-top-4 duration-500">
                <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl shadow-sm p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">

                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-red-100 text-red-600 rounded-full shrink-0">
                            <ShieldAlert size={24} />
                        </div>
                        <div>
                            <h3 className="text-red-800 font-bold text-lg">
                                {incidents.length} {incidents.length === 1 ? 'Cierre Automático Detectado' : 'Cierres Automáticos Detectados'}
                            </h3>
                            <p className="text-red-600 text-sm mt-1">
                                El sistema cerró sesiones olvidadas en $0 por seguridad.
                                <strong> Se requiere conciliación manual.</strong>
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 w-full md:w-auto">
                        <button
                            onClick={() => handleReconcileClick(targetIncident)}
                            className="group flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-all shadow-md hover:shadow-lg animate-pulse"
                        >
                            Revisar y Conciliar
                            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Renderizado Condicional del Modal */}
            {selectedIncident && (
                <ReconciliationModal
                    isOpen={isModalOpen}
                    onClose={handleModalClose}
                    incident={selectedIncident}
                    managerId={user?.id || 'unknown-manager'}
                />
            )}
        </>
    );
}
