'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, ArrowRight, CheckCircle } from 'lucide-react';
import { getRecentSystemIncidentsSecure } from '@/actions/maintenance-v2';
import { usePharmaStore } from '../../store/useStore'; // Para obtener el ID del gerente actual
import { ReconciliationModal } from './ReconciliationModal'; // Importamos el nuevo modal

export default function SystemIncidentsBanner() {
    const { user } = usePharmaStore();
    const [incidents, setIncidents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Estado para el Modal
    const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchIncidents = () => {
        getRecentSystemIncidentsSecure().then((res: { success: boolean; data?: any[] }) => {
            if (res.success && res.data) {
                setIncidents(res.data);
            }
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchIncidents();
    }, []);

    const handleReconcileClick = (incident: any) => {
        setSelectedIncident(incident);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedIncident(null);
        // Recargar incidentes para ver si ya desapareció el que acabamos de arreglar
        fetchIncidents();
    };

    if (loading || incidents.length === 0) return null;

    // Tomamos el primer incidente para la acción rápida (o podríamos listar todos)
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
