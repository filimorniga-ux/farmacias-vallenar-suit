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
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getSucursales().then(setSucursales);
    }, []);

    useEffect(() => {
        if (selectedSucursal) {
            getBodegas(Number(selectedSucursal)).then(setBodegas);
        } else {
            setBodegas([]);
        }
    }, [selectedSucursal]);

    const handleExport = async () => {
        if (!selectedSucursal || !selectedBodega) {
            alert('Por favor seleccione sucursal y bodega');
            return;
        }

        setLoading(true);
        try {
            const result = await exportInventoryReport({
                startDate,
                endDate,
                sucursalId: Number(selectedSucursal),
                bodegaId: Number(selectedBodega)
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
            <h3 className="text-lg font-semibold">Exportar Kardex</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Sucursal</label>
                    <select
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        value={selectedSucursal}
                        onChange={(e) => setSelectedSucursal(e.target.value)}
                    >
                        <option value="">Seleccione Sucursal</option>
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
                        disabled={!selectedSucursal}
                    >
                        <option value="">Seleccione Bodega</option>
                        {bodegas.map(b => (
                            <option key={b.id} value={b.id}>{b.nombre}</option>
                        ))}
                    </select>
                </div>

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
