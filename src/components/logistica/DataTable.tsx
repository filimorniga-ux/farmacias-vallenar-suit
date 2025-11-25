'use client';

import { useState, useMemo } from 'react';
import { LogisticsItem } from '@/lib/data/logistics';
import { Snowflake, Lock, AlertTriangle, AlertOctagon, Search } from 'lucide-react';

interface DataTableProps {
    initialData: LogisticsItem[];
}

export default function DataTable({ initialData }: DataTableProps) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredData = useMemo(() => {
        if (!searchTerm) return initialData;
        const lowerTerm = searchTerm.toLowerCase();
        return initialData.filter(
            (item) =>
                item.nombre.toLowerCase().includes(lowerTerm) ||
                item.numero_lote.toLowerCase().includes(lowerTerm)
        );
    }, [initialData, searchTerm]);

    const getRowStyle = (item: LogisticsItem) => {
        const today = new Date();
        const expiryDate = new Date(item.fecha_vencimiento);
        const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Critical Alert: Stock < Min Stock (assuming 10 for now as default safety stock if not provided) OR Expired
        // The prompt says "stock_minimo_seguridad", but our query didn't fetch it explicitly from a column (it wasn't in the schema provided).
        // I'll assume a default or if I missed it in schema. 
        // Re-reading schema: `productos` table doesn't have `stock_minimo_seguridad`. 
        // I will assume a hardcoded threshold of 10 for now or check if I should add it. 
        // The prompt says "si cantidad < stock_minimo_seguridad". 
        // Since it's not in the schema, I will use a constant for now and add a TODO.
        const MIN_STOCK_SECURITY = 10;
        const isExpired = daysToExpiry <= 0;
        const isLowStock = item.cantidad_disponible < MIN_STOCK_SECURITY;

        if (isExpired || isLowStock) {
            return 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500';
        }

        // FEFO Alert: Expiry < 90 days
        if (daysToExpiry < 90) {
            return 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-yellow-500';
        }

        return 'hover:bg-gray-50 border-l-4 border-transparent';
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-CL');
    };

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    placeholder="Buscar por Nombre o Lote..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Table */}
            <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                                Producto
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Lote
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Ubicación
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Stock
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Vencimiento
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Condición
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {filteredData.map((item) => (
                            <tr key={`${item.producto_id}-${item.lote_id}`} className={getRowStyle(item)}>
                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                                    <div className="flex items-center">
                                        <div className="font-medium text-gray-900">{item.nombre}</div>
                                        {item.requiere_frio && (
                                            <span className="ml-2 text-blue-500" title="Cadena de Frío">
                                                <Snowflake className="h-4 w-4" />
                                            </span>
                                        )}
                                        {(item.condicion_venta === 'RECETA_RETENIDA' || item.condicion_venta === 'RECETA_CHEQUE') && (
                                            <span className="ml-2 text-amber-600" title="Controlado">
                                                <Lock className="h-4 w-4" />
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-gray-500">{item.dci}</div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {item.numero_lote}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {item.ubicacion_fisica || '-'}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm font-medium">
                                    <span className={item.cantidad_disponible < 10 ? 'text-red-600' : 'text-gray-900'}>
                                        {item.cantidad_disponible}
                                    </span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {formatDate(item.fecha_vencimiento)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${item.estado === 'DISPONIBLE' ? 'bg-green-100 text-green-800' :
                                            item.estado === 'CUARENTENA' ? 'bg-yellow-100 text-yellow-800' :
                                                item.estado === 'VENCIDO' ? 'bg-red-100 text-red-800' :
                                                    'bg-gray-100 text-gray-800'
                                        }`}>
                                        {item.estado}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
