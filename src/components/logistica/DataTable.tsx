'use client';

import { useState, useMemo } from 'react';
import { LogisticsItem } from '@/lib/data/logistics';
import { Snowflake, Lock, Search, Filter } from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';

interface DataTableProps {
    initialData: LogisticsItem[];
}

export default function DataTable({ initialData }: DataTableProps) {
    const { currentWarehouseId, user } = usePharmaStore(); // Get context
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>(currentWarehouseId || ''); // Initialize with context
    const [isGrouped, setIsGrouped] = useState(true);

    // Permissions: Only Managers/Admin can switch warehouse view
    const isManager = user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'GERENTE_GENERAL';

    // Force selection to current warehouse if not manager, or if no selection made
    if (!isManager && currentWarehouseId && selectedWarehouse !== currentWarehouseId) {
        setSelectedWarehouse(currentWarehouseId);
    }

    // Extract unique warehouses from data for the dropdown
    const availableWarehouses = useMemo(() => {
        const map = new Map<string, string>();
        initialData.forEach(item => {
            if (item.warehouse_id && item.ubicacion_fisica) {
                map.set(item.warehouse_id, item.ubicacion_fisica);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [initialData]);

    const processedData = useMemo(() => {
        let regex: RegExp;
        try {
            regex = new RegExp(searchTerm, 'i');
        } catch {
            regex = new RegExp('');
        }

        // 1. Strict Filter by Warehouse (Required)
        // If no warehouse is selected (shouldn't happen usually), show nothing or everything? Strict means show nothing until selected.
        // But for UX, we default to current.
        if (!selectedWarehouse) return [];

        const filtered = initialData.filter(
            (item) => {
                // Strict Warehouse Check
                if (item.warehouse_id !== selectedWarehouse) return false;

                const matchesSearch = regex.test(item.nombre) ||
                    regex.test(item.numero_lote || '') ||
                    regex.test(item.sku || '');

                return matchesSearch;
            }
        );

        // 2. Grouping Logic
        if (isGrouped) {
            const groupedMap = new Map<string, LogisticsItem & { lotes_count: number; min_expiry: string; max_expiry: string }>();

            for (const item of filtered) {
                const key = item.producto_id; // Group by Product ID (Master)
                const existing = groupedMap.get(key);

                if (existing) {
                    existing.cantidad_disponible += item.cantidad_disponible;
                    existing.lotes_count += 1;

                    // Track expiry range
                    if (item.fecha_vencimiento < existing.min_expiry) existing.min_expiry = item.fecha_vencimiento;
                    if (item.fecha_vencimiento > existing.max_expiry) existing.max_expiry = item.fecha_vencimiento;

                    // Keep worst status logic if needed, or just keep first
                } else {
                    // Create new entry
                    groupedMap.set(key, {
                        ...item,
                        lotes_count: 1,
                        min_expiry: item.fecha_vencimiento,
                        max_expiry: item.fecha_vencimiento
                    });
                }
            }
            return Array.from(groupedMap.values());
        }

        return filtered;
    }, [initialData, searchTerm, isGrouped, selectedWarehouse]);

    const getRowStyle = (item: LogisticsItem) => {
        const today = new Date();
        const expiryDate = new Date(item.fecha_vencimiento);
        const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const MIN_STOCK_SECURITY = 10;

        // Logic for Grouped Items: Check simple low stock
        if (isGrouped) {
            if (item.cantidad_disponible < MIN_STOCK_SECURITY) return 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500';
            return 'hover:bg-gray-50 border-l-4 border-transparent';
        }

        const isExpired = daysToExpiry <= 0;
        const isLowStock = item.cantidad_disponible < MIN_STOCK_SECURITY;

        if (isExpired || isLowStock) {
            return 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500';
        }

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
            {/* Header Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-lg shadow-sm">

                {/* Warehouse Filter - Only Visible if Manager/Admin or if changing is allowed */}
                {isManager && (
                    <div className="relative w-full sm:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Filter className="h-5 w-5 text-gray-400" />
                        </div>
                        <select
                            value={selectedWarehouse}
                            onChange={(e) => setSelectedWarehouse(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        >
                            {/* No 'All Warehouses' option anymore */}
                            {availableWarehouses.map(w => (
                                <option key={w.id} value={w.id}>
                                    {w.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Visual Indicator for Non-Managers */}
                {!isManager && selectedWarehouse && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Filter className="h-4 w-4" />
                        <span>Viendo: <strong>{availableWarehouses.find(w => w.id === selectedWarehouse)?.name || 'Mi Sucursal'}</strong></span>
                    </div>
                )}

                {/* Search Bar */}
                <div className="relative w-full sm:w-96">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar por Nombre, SKU o Lote..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Group Toggle */}
                <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${!isGrouped ? 'text-purple-600' : 'text-gray-500'}`}>Desglosado</span>
                    <button
                        onClick={() => setIsGrouped(!isGrouped)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isGrouped ? 'bg-purple-600' : 'bg-gray-200'}`}
                    >
                        <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isGrouped ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                    </button>
                    <span className={`text-sm font-medium ${isGrouped ? 'text-purple-600' : 'text-gray-500'}`}>Agrupado por Producto</span>
                </div>
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
                                {isGrouped ? 'Rangos Lote / Vencimiento' : 'Lote'}
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Ubicación
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Total Stock
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                {isGrouped ? 'Vencimiento' : 'Vencimiento'}
                            </th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Condición
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {processedData.map((item: any) => (
                            <tr key={isGrouped ? item.producto_id : `${item.producto_id}-${item.lote_id}`} className={getRowStyle(item)}>
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
                                        {isGrouped && item.lotes_count > 1 && (
                                            <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                                                {item.lotes_count} Lotes
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-gray-500">{item.dci}</div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {isGrouped ? (
                                        <div className="text-xs text-gray-400">
                                            Varios
                                        </div>
                                    ) : item.numero_lote}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {item.ubicacion_fisica || '-'}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm font-bold text-gray-900">
                                    {item.cantidad_disponible}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {isGrouped
                                        ? `${formatDate(item.min_expiry)} ${item.min_expiry !== item.max_expiry ? '-> ' + formatDate(item.max_expiry) : ''}`
                                        : formatDate(item.fecha_vencimiento)
                                    }
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
