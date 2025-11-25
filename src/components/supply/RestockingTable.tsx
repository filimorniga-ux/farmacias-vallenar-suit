'use client';

import { RestockingItem } from '@/lib/data/supply';
import { AlertTriangle, ShoppingCart } from 'lucide-react';

interface RestockingTableProps {
    suggestions: RestockingItem[];
}

export default function RestockingTable({ suggestions }: RestockingTableProps) {
    if (suggestions.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg shadow">
                <div className="mx-auto h-12 w-12 text-green-500">
                    <ShoppingCart className="h-full w-full" />
                </div>
                <h3 className="mt-2 text-sm font-semibold text-gray-900">Sin sugerencias</h3>
                <p className="mt-1 text-sm text-gray-500">El inventario está saludable. No se requieren compras urgentes.</p>
            </div>
        );
    }

    return (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
            <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <h3 className="text-sm font-medium text-red-800">Sugerencia de Compra Urgente</h3>
            </div>
            <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                            Producto
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Stock Actual
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Mínimo
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Sugerido
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Proveedor
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                    {suggestions.map((item) => (
                        <tr key={item.producto_id}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                {item.nombre}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-red-600 font-bold">
                                {item.stock_actual}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {item.stock_minimo}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-blue-600 font-bold bg-blue-50">
                                {item.sugerencia_pedido}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {item.proveedor_sugerido}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
