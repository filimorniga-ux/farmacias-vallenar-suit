'use client';

import { Download } from 'lucide-react';

export default function ExportButton() {
    const handleExport = () => {
        alert('Simulación: Descargando Libro de Ventas (Excel)...');
        console.log('Exporting Sales Book...');
    };

    return (
        <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
            <Download className="-ml-0.5 mr-1.5 h-5 w-5 text-gray-400" aria-hidden="true" />
            Descargar Libro de Ventas
        </button>
    );
}
