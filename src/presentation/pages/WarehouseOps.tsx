import React, { useState } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Package, Truck, ArrowRight, CheckCircle, AlertTriangle, Search, Filter, FileText, Camera } from 'lucide-react';
import { StockTransfer, WarehouseIncident } from '../../domain/types';

export const WarehouseOps = () => {
    const {
        inventory,
        stockTransfers,
        dispatchTransfer,
        receiveTransfer,
        suppliers,
        addPurchaseOrder,
        receivePurchaseOrder
    } = usePharmaStore();

    const [activeTab, setActiveTab] = useState<'INBOUND' | 'OUTBOUND' | 'TRANSIT' | 'REVERSE'>('INBOUND');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);

    // --- MOCK DATA FOR UI DEV ---
    // In a real app, these would come from the store or API

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Package className="w-8 h-8 text-blue-600" />
                    Operaciones Logísticas (WMS)
                </h1>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Reportes
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                        <Truck className="w-4 h-4" />
                        Nueva Orden
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('INBOUND')}
                    className={`pb-3 px-4 font-medium flex items-center gap-2 ${activeTab === 'INBOUND' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <ArrowRight className="w-4 h-4 rotate-90" />
                    Recepción (Inbound)
                </button>
                <button
                    onClick={() => setActiveTab('OUTBOUND')}
                    className={`pb-3 px-4 font-medium flex items-center gap-2 ${activeTab === 'OUTBOUND' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <ArrowRight className="w-4 h-4 -rotate-90" />
                    Despacho (Outbound)
                </button>
                <button
                    onClick={() => setActiveTab('TRANSIT')}
                    className={`pb-3 px-4 font-medium flex items-center gap-2 ${activeTab === 'TRANSIT' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Truck className="w-4 h-4" />
                    En Tránsito
                    {stockTransfers.filter(t => t.status === 'IN_TRANSIT').length > 0 && (
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                            {stockTransfers.filter(t => t.status === 'IN_TRANSIT').length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('REVERSE')}
                    className={`pb-3 px-4 font-medium flex items-center gap-2 ${activeTab === 'REVERSE' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <AlertTriangle className="w-4 h-4" />
                    Logística Inversa
                </button>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Buscar por SKU, Lote, Orden o Proveedor..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-600">
                    <Filter className="w-4 h-4" />
                    Filtros
                </button>
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[400px] p-6">
                {activeTab === 'INBOUND' && <InboundView />}
                {activeTab === 'OUTBOUND' && <OutboundView />}
                {activeTab === 'TRANSIT' && <TransitView transfers={stockTransfers} onReceive={receiveTransfer} />}
                {activeTab === 'REVERSE' && <ReverseLogisticsView />}
            </div>
        </div>
    );
};

// --- Sub-components (Placeholders for now, will expand) ---

const InboundView = () => (
    <div className="text-center py-12 text-gray-500">
        <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900">Recepción de Mercadería</h3>
        <p>Gestione la recepción de órdenes de compra y devoluciones.</p>
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Ingresar Recepción Manual
        </button>
    </div>
);

const OutboundView = () => (
    <div className="text-center py-12 text-gray-500">
        <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900">Despacho y Transferencias</h3>
        <p>Cree transferencias entre sucursales o devoluciones a proveedores.</p>
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Nueva Transferencia
        </button>
    </div>
);

const TransitView = ({ transfers, onReceive }: { transfers: StockTransfer[], onReceive: any }) => {
    const inTransit = transfers.filter(t => t.status === 'IN_TRANSIT');

    if (inTransit.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-medium text-gray-900">Todo al día</h3>
                <p>No hay mercadería en tránsito actualmente.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {inTransit.map(transfer => (
                <div key={transfer.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-lg text-gray-900">{transfer.id}</span>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">En Tránsito</span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Origen: <span className="font-medium text-gray-700">{transfer.origin_location_id}</span>
                                <ArrowRight className="w-3 h-3 inline mx-2" />
                                Destino: <span className="font-medium text-gray-700">{transfer.destination_location_id}</span>
                            </p>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                            <p>Enviado: {new Date(transfer.timeline.dispatched_at!).toLocaleDateString()}</p>
                            <p>{transfer.items.length} Items</p>
                        </div>
                    </div>

                    <div className="bg-gray-50 rounded p-3 mb-4">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Contenido</h4>
                        <ul className="space-y-1">
                            {transfer.items.map((item, idx) => (
                                <li key={idx} className="text-sm flex justify-between">
                                    <span>{item.sku}</span>
                                    <span className="font-medium">x{item.quantity}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
                            Ver Documentos
                        </button>
                        <button
                            onClick={() => onReceive(transfer.id)}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                        >
                            <CheckCircle className="w-3 h-3" />
                            Recepcionar
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

const ReverseLogisticsView = () => (
    <div className="text-center py-12 text-gray-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-orange-400" />
        <h3 className="text-lg font-medium text-gray-900">Logística Inversa</h3>
        <p>Gestión de mermas, vencidos y devoluciones de clientes.</p>
    </div>
);
