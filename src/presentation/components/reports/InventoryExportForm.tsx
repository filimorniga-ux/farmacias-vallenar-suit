'use client';

import { useState, useEffect } from 'react';
import { exportInventoryReport, getSucursales, getBodegas } from '@/actions/inventory-export';

export function InventoryExportForm() {
    const [sucursales, setSucursales] = useState<{ id: number, nombre: string }[]>([]);
    const [bodegas, setBodegas] = useState<{ id: number, nombre: string }[]>([]);
    const [selectedSucursal, setSelectedSucursal] = useState<string>('');
    const [selectedBodega, setSelectedBodega] = useState<string>('');
    const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [reportType, setReportType] = useState<'kardex' | 'seed'>('kardex');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getSucursales().then(setSucursales);
    }, []);

    useEffect(() => {
        getBodegas(selectedSucursal ? Number(selectedSucursal) : undefined).then(setBodegas);
    }, [selectedSucursal]);

    const handleExport = async () => {
        // Validamos solo si hay inconsistencias o si se requiere lógica específica, pero ahora permitimos "Todas"
        // if (!selectedSucursal) { ... } -> Removed

        setLoading(true);
        try {
            const result = await exportInventoryReport({
                startDate,
                endDate,
                sucursalId: Number(selectedSucursal),
                bodegaId: selectedBodega ? Number(selectedBodega) : null,
                type: reportType
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
                        value="kardex"
                        checked={reportType === 'kardex'}
                        onChange={() => setReportType('kardex')}
                    />
                    <span className="ml-2">Kardex (Histórico)</span>
                </label>
                <label className="inline-flex items-center cursor-pointer">
                    <input
                        type="radio"
                        className="form-radio text-indigo-600"
                        name="reportType"
                        value="seed"
                        checked={reportType === 'seed'}
                        onChange={() => setReportType('seed')}
                    />
                    <span className="ml-2">Inventario Semilla (Actual)</span>
                </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Sucursal</label>
                    <select
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        value={selectedSucursal}
                        onChange={(e) => setSelectedSucursal(e.target.value)}
                    >
                        <option value="">Todas las Sucursales</option>
                        {sucursales.map(s => (
                            <option key={s.id} value={s.id}>{s.nombre}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Bodega</label>
                    <select
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        value={selectedBodega}
                        onChange={(e) => setSelectedBodega(e.target.value)}
                    >
                        <option value="">Todas las Bodegas</option>
                        {bodegas.map(b => (
                            <option key={b.id} value={b.id}>{b.nombre}</option>
                        ))}
                    </select>
                </div>

                {reportType === 'kardex' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Desde</label>
                            <input
                                type="date"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Hasta</label>
                            <input
                                type="date"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </>
                )}
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
