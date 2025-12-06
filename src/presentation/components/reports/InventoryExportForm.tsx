'use client';

import { useState, useEffect } from 'react';
import { exportInventoryReport, getLocations, getWarehouses } from '@/actions/inventory-export';
import { usePharmaStore } from '@/presentation/store/useStore';

export function InventoryExportForm() {
    const { user, currentLocationId } = usePharmaStore();
    const isManagerial = ['MANAGER', 'ADMIN', 'QF'].includes(user?.role || '');

    const [locations, setLocations] = useState<{ id: string, name: string }[]>([]);
    const [warehouses, setWarehouses] = useState<{ id: string, name: string }[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string>('');
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
    const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [reportType, setReportType] = useState<'kardex' | 'seed'>('seed'); // Default to seed (actual)
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isManagerial) {
            getLocations().then(setLocations);
        } else {
            // If not manager, just set current location as the only option (for logic consistency)
            // Or easier: Just don't fetch list, logic handles effective ID.
            setSelectedLocation(currentLocationId);
        }
    }, [isManagerial, currentLocationId]);

    useEffect(() => {
        // Fetch warehouses for the selected location (or current location if constrained)
        const locId = isManagerial ? selectedLocation : currentLocationId;
        if (locId) {
            getWarehouses(locId).then(setWarehouses);
        } else {
            setWarehouses([]);
        }
    }, [selectedLocation, currentLocationId, isManagerial]);

    const handleExport = async () => {
        setLoading(true);
        try {
            const result = await exportInventoryReport({
                startDate,
                endDate,
                locationId: isManagerial ? selectedLocation : currentLocationId, // User choice OR forced
                warehouseId: selectedWarehouse || undefined,
                type: reportType,
                requestingUserRole: user?.role || 'CASHIER',
                requestingUserLocationId: currentLocationId
            });

            if (result.success && result.data) {
                // Crear blob y descargar
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename || 'reporte.xlsx';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                alert('Error al exportar: ' + result.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error inesperado al exportar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 bg-white rounded-lg shadow space-y-4">
            <h3 className="text-lg font-semibold">Exportar Inventario</h3>

            <div className="flex space-x-4 mb-4">
                <label className="inline-flex items-center cursor-pointer">
                    <input
                        type="radio"
                        className="form-radio text-indigo-600"
                        name="reportType"
                        value="seed"
                        checked={reportType === 'seed'}
                        onChange={() => setReportType('seed')}
                    />
                    <span className="ml-2">Inventario Actual (Semilla)</span>
                </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LOCATION SELECTOR - Only for Managers */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Sucursal</label>
                    {isManagerial ? (
                        <select
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                            value={selectedLocation}
                            onChange={(e) => setSelectedLocation(e.target.value)}
                        >
                            <option value="">Todas las Sucursales</option>
                            {locations.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            disabled
                            value={currentLocationId || 'Mi Sucursal'}
                            className="mt-1 block w-full rounded-md border-gray-200 bg-gray-100 text-gray-500 sm:text-sm p-2 border"
                        />
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Bodega</label>
                    <select
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        value={selectedWarehouse}
                        onChange={(e) => setSelectedWarehouse(e.target.value)}
                    >
                        <option value="">Todas las Bodegas</option>
                        {warehouses.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <button
                onClick={handleExport}
                disabled={loading}
                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {loading ? 'Generando...' : 'Exportar Excel'}
            </button>
        </div>
    );
}
