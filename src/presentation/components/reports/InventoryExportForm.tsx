'use client';

import { useState, useEffect } from 'react';
// V2: Funciones seguras
import { getLocationsSecure, getWarehousesByLocationSecure } from '@/actions/locations-v2'; // Changed import
import { exportInventoryReportSecure, exportStockMovementsSecure } from '@/actions/inventory-export-v2';
import { usePharmaStore } from '@/presentation/store/useStore';

type InventoryExportType = 'snapshot' | 'kardex';

const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateInput(value: string) {
    if (!DATE_INPUT_RE.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime());
}

function getKardexDateError(startDate: string, endDate: string) {
    if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
        return 'Seleccione un rango de fechas válido para exportar el kardex.';
    }

    if (startDate > endDate) {
        return 'La fecha Desde no puede ser posterior a la fecha Hasta.';
    }

    return null;
}

export function InventoryExportForm() {
    const { user, currentLocationId } = usePharmaStore();
    const isManagerial = ['MANAGER', 'ADMIN', 'QF'].includes(user?.role || '');

    const [locations, setLocations] = useState<{ id: string, name: string }[]>([]);
    const [warehouses, setWarehouses] = useState<{ id: string, name: string }[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string>('');
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [reportType, setReportType] = useState<InventoryExportType>('snapshot');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        setErrorMessage(null);

        if (reportType === 'kardex') {
            const dateError = getKardexDateError(startDate, endDate);
            if (dateError) {
                setErrorMessage(dateError);
                return;
            }
        }

        setLoading(true);
        try {
            const effectiveLocationId = (isManagerial ? selectedLocation : currentLocationId) || undefined;

            const result = reportType === 'kardex'
                ? await exportStockMovementsSecure({
                    startDate,
                    endDate,
                    locationId: effectiveLocationId,
                    limit: 5000,
                })
                : await exportInventoryReportSecure({
                    locationId: effectiveLocationId,
                    warehouseId: selectedWarehouse || undefined,
                    type: 'seed',
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
                setErrorMessage(`Error al exportar: ${result.error || 'No fue posible generar el archivo.'}`);
            }
        } catch {
            setErrorMessage('Error inesperado al exportar.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 bg-white rounded-lg shadow space-y-4">
            <h3 className="text-lg font-semibold">Exportar Inventario</h3>

            <div className="grid grid-cols-1 gap-1 p-1 bg-slate-100 rounded-xl mb-4 sm:grid-cols-2">
                <button
                    type="button"
                    aria-pressed={reportType === 'snapshot'}
                    onClick={() => {
                        setReportType('snapshot');
                        setErrorMessage(null);
                    }}
                    className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${reportType === 'snapshot' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Inventario Actual
                </button>
                <button
                    type="button"
                    aria-pressed={reportType === 'kardex'}
                    onClick={() => {
                        setReportType('kardex');
                        setErrorMessage(null);
                    }}
                    className={`min-h-11 rounded-lg px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${reportType === 'kardex' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Kardex Histórico
                </button>
            </div>

            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {reportType === 'snapshot'
                    ? 'Inventario actual: stock vigente por producto y lote.'
                    : 'Kardex histórico: movimientos dentro del rango seleccionado.'}
            </p>

            {reportType === 'kardex' && (
                <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-top-2 sm:grid-cols-2">
                    <div className="space-y-1">
                        <label htmlFor="inventory-export-start-date" className="text-xs font-bold text-slate-500 uppercase ml-1">Desde</label>
                        <input
                            id="inventory-export-start-date"
                            name="inventory-export-start-date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="block min-h-11 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-700 text-base p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 border sm:text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="inventory-export-end-date" className="text-xs font-bold text-slate-500 uppercase ml-1">Hasta</label>
                        <input
                            id="inventory-export-end-date"
                            name="inventory-export-end-date"
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="block min-h-11 w-full rounded-xl border-slate-200 bg-slate-50 text-slate-700 text-base p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 border sm:text-sm"
                        />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LOCATION SELECTOR - Only for Managers */}
                <div>
                    <label htmlFor="inventory-export-location" className="block text-sm font-medium text-gray-700">Sucursal</label>
                    {isManagerial ? (
                        <select
                            id="inventory-export-location"
                            name="inventory-export-location"
                            className="mt-1 block min-h-11 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base sm:text-sm p-2 border"
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
                            id="inventory-export-location"
                            name="inventory-export-location"
                            type="text"
                            disabled
                            value={currentLocationId || 'Mi Sucursal'}
                            className="mt-1 block min-h-11 w-full rounded-md border-gray-200 bg-gray-100 text-gray-500 text-base sm:text-sm p-2 border"
                        />
                    )}
                </div>

                {reportType === 'snapshot' ? (
                    <div>
                        <label htmlFor="inventory-export-warehouse" className="block text-sm font-medium text-gray-700">Bodega</label>
                        <select
                            id="inventory-export-warehouse"
                            name="inventory-export-warehouse"
                            className="mt-1 block min-h-11 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base sm:text-sm p-2 border"
                            value={selectedWarehouse}
                            onChange={(e) => setSelectedWarehouse(e.target.value)}
                        >
                            <option value="">Todas las Bodegas</option>
                            {warehouses.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        El kardex usa sucursal y rango de fechas. La bodega no aplica en este export.
                    </div>
                )}
            </div>

            {errorMessage && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                    {errorMessage}
                </div>
            )}

            <button
                type="button"
                onClick={handleExport}
                disabled={loading}
                className={`flex min-h-11 w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {loading
                    ? 'Generando…'
                    : reportType === 'kardex'
                        ? 'Exportar kardex histórico'
                        : 'Exportar inventario actual'}
            </button>
        </div>
    );
}
