'use client';

import { useState, useEffect } from 'react';
// V2: Funciones seguras
import { getLocationsSecure, getWarehousesByLocationSecure } from '@/actions/locations-v2'; // Changed import
import { exportInventoryReportSecure } from '@/actions/inventory-export-v2';
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
            // V2: getLocationsSecure retorna { success, data }
            getLocationsSecure().then((res) => {
                if (res.success && res.data) setLocations(res.data.map((l: any) => ({ id: l.id, name: l.name })));
            });
        } else {
            // If not manager, just set current location as the only option
            setSelectedLocation(currentLocationId);
        }
    }, [isManagerial, currentLocationId]);

    useEffect(() => {
        // Fetch warehouses for the selected location (or current location if constrained)
        const locId = isManagerial ? selectedLocation : currentLocationId;
        if (locId) {
            setLoading(true);
            getWarehousesByLocationSecure(locId).then((res) => {
                setLoading(false);
                if (res.success && res.data) {
                    setWarehouses(res.data);
                    // UX Improvement: Auto-select if only one warehouse
                    if (res.data.length === 1) {
                        setSelectedWarehouse(res.data[0].id);
                    }
                } else {
                    setWarehouses([]);
                }
            });
        } else {
            setWarehouses([]);
        }
    }, [selectedLocation, currentLocationId, isManagerial]);

    const handleExport = async () => {
        setLoading(true);
        try {
            const result = reportType === 'kardex'
                ? await exportInventoryReportSecure({
                    locationId: isManagerial ? selectedLocation : currentLocationId,
                    warehouseId: selectedWarehouse || undefined,
                    type: 'kardex',
                    // Note: If we had a generic movements exporter that takes dates, we'd use it here.
                    // For now, exportInventoryReport handles 'kardex' as a snapshot if type='kardex' 
                    // But we want HISTORICAL movements. Let's use exportStockMovementsSecure if type is kardex.
                })
                : await exportInventoryReportSecure({
                    locationId: isManagerial ? selectedLocation : currentLocationId,
                    warehouseId: selectedWarehouse || undefined,
                    type: 'seed',
                });

            // Improvement: If kardex is selected and we have dates, call the movements exporter instead
            let finalResult = result;
            if (reportType === 'kardex') {
                const { exportStockMovementsSecure } = await import('@/actions/inventory-export-v2');
                finalResult = await exportStockMovementsSecure({
                    startDate: `${startDate}T00:00:00Z`,
                    endDate: `${endDate}T23:59:59Z`,
                    locationId: isManagerial ? selectedLocation : currentLocationId,
                });
            }

            if (finalResult.success && finalResult.data) {
                // Crear blob y descargar
                const byteCharacters = atob(finalResult.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = finalResult.filename || 'reporte.xlsx';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                alert('Error al exportar: ' + finalResult.error);
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

            <div className="flex gap-4 p-1 bg-slate-100 rounded-xl mb-4">
                <button
                    onClick={() => setReportType('seed')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${reportType === 'seed' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Inventario Actual
                </button>
                <button
                    onClick={() => setReportType('kardex')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${reportType === 'kardex' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Kardex Histórico
                </button>
            </div>

            {reportType === 'kardex' && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Desde</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="block w-full rounded-xl border-slate-200 bg-slate-50 text-slate-700 text-sm p-2.5 font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 border"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Hasta</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="block w-full rounded-xl border-slate-200 bg-slate-50 text-slate-700 text-sm p-2.5 font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 border"
                        />
                    </div>
                </div>
            )}

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
