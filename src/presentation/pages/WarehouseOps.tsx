import React, { useState } from 'react';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import { Package, Truck, ArrowRight, CheckCircle, AlertTriangle, Search, Filter, FileText, Camera, MapPin, Clock, Download, X, Calendar, ArrowUp, ArrowDown, Edit2 } from 'lucide-react';
import { Shipment } from '../../domain/types';
import UnifiedReception from '../components/warehouse/UnifiedReception';
import DispatchWizard from '../components/warehouse/DispatchWizard';
import DocumentViewerModal from '../components/warehouse/DocumentViewerModal';
import ScanReceptionModal from '../components/warehouse/ScanReceptionModal';
import { toast } from 'sonner';

export const WarehouseOps = () => {
    const { shipments } = usePharmaStore();
    const { currentLocation } = useLocationStore();
    const [activeTab, setActiveTab] = useState<'INBOUND' | 'OUTBOUND' | 'TRANSIT' | 'REVERSE'>('INBOUND');
    const [searchTerm, setSearchTerm] = useState('');

    // Modal States
    const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [isScanReceptionOpen, setIsScanReceptionOpen] = useState(false);
    const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
    const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);

    // Advanced Filters State
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

    const isWarehouse = currentLocation?.type === 'WAREHOUSE';
    const currentLocationId = currentLocation?.id || 'SUCURSAL_CENTRO';

    // Clear all filters
    const handleClearFilters = () => {
        setDateRange({ start: '', end: '' });
        setSortOrder('newest');
        setSearchTerm('');
        toast.success('Filtros limpiados');
    };

    // Filter Logic - LOCATION-AWARE + DATE RANGE + SORTING
    const filteredShipments = shipments
        .filter(s => {
            // 1. Text Search Filter
            const matchesSearch =
                s.transport_data.tracking_number.includes(searchTerm) ||
                s.origin_location_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.items.some(i => i.sku.includes(searchTerm));

            if (!matchesSearch) return false;

            // 2. Date Range Filter
            let matchesDate = true;
            const itemDate = new Date(s.created_at).getTime();

            if (dateRange.start) {
                const startDate = new Date(dateRange.start).getTime();
                matchesDate = matchesDate && itemDate >= startDate;
            }

            if (dateRange.end) {
                const endDate = new Date(dateRange.end);
                endDate.setHours(23, 59, 59, 999); // Include entire end day
                matchesDate = matchesDate && itemDate <= endDate.getTime();
            }

            if (!matchesDate) return false;

            // 3. Location-based Filter (WAREHOUSE vs STORE logic)
            if (isWarehouse) {
                if (activeTab === 'INBOUND') return false;
                if (activeTab === 'OUTBOUND') return s.origin_location_id === currentLocationId;
                if (activeTab === 'TRANSIT') return s.status === 'IN_TRANSIT' && s.origin_location_id === currentLocationId;
                if (activeTab === 'REVERSE') return s.type === 'RETURN' && s.destination_location_id === currentLocationId;
            } else {
                if (activeTab === 'INBOUND') return s.status === 'IN_TRANSIT' && s.destination_location_id === currentLocationId;
                if (activeTab === 'OUTBOUND') return s.origin_location_id === currentLocationId;
                if (activeTab === 'TRANSIT') return s.status === 'IN_TRANSIT' && s.origin_location_id === currentLocationId;
                if (activeTab === 'REVERSE') return s.type === 'RETURN' && s.origin_location_id === currentLocationId;
            }

            return false;
        })
        .sort((a, b) => {
            // 4. Chronological Sorting
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });

    const handleReceiveClick = (shipment: Shipment) => {
        setSelectedShipment(shipment);
        setIsReceptionModalOpen(true);
    };

    const handleViewDocs = (shipment: Shipment) => {
        setSelectedShipment(shipment);
        setIsDocViewerOpen(true);
    };

    const handleEditShipment = (shipment: Shipment) => {
        // For now, just a toast as requested in "Entregable" logic for Edit button
        // Real implementation would open a modal to edit transport data
        toast.info(`Editando envío OT: ${shipment.transport_data.tracking_number}`, {
            description: 'Funcionalidad de edición de transporte en desarrollo'
        });
    };

    const handlePrintReport = async () => {
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const doc = new jsPDF();

            // Header
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('Informe de Movimientos de Bodega', 14, 20);

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 14, 28);
            doc.text(`Hora: ${new Date().toLocaleTimeString('es-CL')}`, 14, 33);

            // Prepare table data from ALL shipments (not just filtered) for the day
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const dailyShipments = shipments.filter(s => s.created_at >= todayStart.getTime());

            const tableData = dailyShipments.map(s => [
                new Date(s.created_at).toLocaleTimeString('es-CL'),
                s.type === 'INBOUND_PROVIDER' ? 'Entrada' : s.type === 'INTERNAL_TRANSFER' ? 'Transferencia' : 'Devolución',
                `${s.origin_location_id} → ${s.destination_location_id}`,
                s.status.replace('_', ' '),
                s.transport_data.package_count.toString(),
                `$${s.valuation.toLocaleString('es-CL')}`
            ]);

            // Add table
            autoTable(doc, {
                startY: 40,
                head: [['Hora', 'Tipo', 'Ruta', 'Estado', 'Bultos', 'Valorización']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 3 },
            });

            // Footer
            const pageCount = doc.internal.pages.length - 1;
            doc.setFontSize(8);
            doc.text(`Total de registros hoy: ${dailyShipments.length}`, 14, doc.internal.pageSize.height - 10);
            doc.text(`Página 1 de ${pageCount}`, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 10);

            // Save
            doc.save(`informe-bodega-${new Date().toISOString().split('T')[0]}.pdf`);
            toast.success('Reporte PDF generado exitosamente');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Error al generar el reporte PDF');
        }
    };

    return (
        <div className="p-6 space-y-6 h-[calc(100vh-80px)] overflow-y-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Package className="w-8 h-8 text-blue-600" />
                    Operaciones Logísticas (WMS)
                </h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsScanReceptionOpen(true)}
                        className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 flex items-center gap-2 font-bold text-sm shadow-lg shadow-cyan-200"
                    >
                        <Camera className="w-4 h-4" />
                        Recepción Escáner
                    </button>
                    <button
                        onClick={handlePrintReport}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-2 font-bold text-sm"
                    >
                        <FileText className="w-4 h-4" />
                        Reportes
                    </button>
                    <button
                        onClick={() => setIsDispatchModalOpen(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold text-sm shadow-lg shadow-blue-200"
                    >
                        <Truck className="w-4 h-4" />
                        Nuevo Despacho
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('INBOUND')}
                    className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === 'INBOUND' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <ArrowRight className="w-4 h-4 rotate-90" />
                    Recepción (Inbound)
                    {shipments.filter(s => s.status === 'IN_TRANSIT' && s.destination_location_id === currentLocationId).length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                            {shipments.filter(s => s.status === 'IN_TRANSIT' && s.destination_location_id === currentLocationId).length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('OUTBOUND')}
                    className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === 'OUTBOUND' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <ArrowRight className="w-4 h-4 -rotate-90" />
                    Despacho (Outbound)
                </button>
                <button
                    onClick={() => setActiveTab('TRANSIT')}
                    className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === 'TRANSIT' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <Truck className="w-4 h-4" />
                    En Tránsito
                </button>
                <button
                    onClick={() => setActiveTab('REVERSE')}
                    className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors ${activeTab === 'REVERSE' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <AlertTriangle className="w-4 h-4" />
                    Logística Inversa
                </button>
            </div>

            {/* Search & Filter Bar */}
            <div className="space-y-2">
                <div className="flex gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Buscar por OT, Proveedor o SKU..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setShowFilterPanel(!showFilterPanel)}
                        className={`px-4 py-2 border rounded-lg flex items-center gap-2 font-bold text-sm transition-all ${showFilterPanel
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                            }`}
                    >
                        <Filter className="w-4 h-4" />
                        Filtros
                        {(dateRange.start || dateRange.end) && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                {[dateRange.start, dateRange.end].filter(Boolean).length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Advanced Filter Panel */}
                {showFilterPanel && (
                    <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Filter className="w-4 h-4 text-blue-600" />
                                Filtros Avanzados
                            </h3>
                            <button
                                onClick={() => setShowFilterPanel(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Date Range */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-1" />
                                    Desde
                                </label>
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-1" />
                                    Hasta
                                </label>
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>

                            {/* Sort Order */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    <Clock className="w-4 h-4 inline mr-1" />
                                    Ordenar por Fecha
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setSortOrder('newest')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 transition-all ${sortOrder === 'newest'
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        <ArrowDown className="w-4 h-4" />
                                        Recientes
                                    </button>
                                    <button
                                        onClick={() => setSortOrder('oldest')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 transition-all ${sortOrder === 'oldest'
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        <ArrowUp className="w-4 h-4" />
                                        Antiguos
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                            <div className="text-xs text-gray-600">
                                {filteredShipments.length} resultado(s) encontrado(s)
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleClearFilters}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Limpiar Filtros
                                </button>
                                <button
                                    onClick={() => setShowFilterPanel(false)}
                                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Aplicar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[400px] p-6">
                {activeTab === 'TRANSIT' && (
                    <div className="mb-6 bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-2 rounded-lg">
                                <Truck className="text-blue-600" size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-blue-600 uppercase">Valorización en Ruta</p>
                                <p className="text-2xl font-extrabold text-blue-900">
                                    ${filteredShipments.reduce((sum, s) => sum + s.valuation, 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-blue-400 uppercase">Envíos Activos</p>
                            <p className="text-xl font-bold text-blue-800">{filteredShipments.length}</p>
                        </div>
                    </div>
                )}

                {filteredShipments.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <Package className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <h3 className="text-lg font-bold text-gray-500">No hay registros encontrados</h3>
                        <p className="text-sm">Intente ajustar los filtros o cree una nueva operación.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {filteredShipments.map(shipment => (
                            <div key={shipment.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all bg-white group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-start gap-4">
                                        <div className={`p-3 rounded-xl ${shipment.type === 'INBOUND_PROVIDER' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {shipment.type === 'INBOUND_PROVIDER' ? <Package size={24} /> : <Truck size={24} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-lg text-gray-800">OT: {shipment.transport_data.tracking_number}</span>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide
                                                    ${shipment.status === 'IN_TRANSIT' ? 'bg-amber-100 text-amber-700' :
                                                        shipment.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {shipment.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-gray-500">
                                                <div className="flex items-center gap-1">
                                                    <MapPin size={14} />
                                                    <span>{shipment.origin_location_id}</span>
                                                    <ArrowRight size={14} className="mx-1" />
                                                    <span className="font-bold text-gray-700">{shipment.destination_location_id}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock size={14} />
                                                    <span>{new Date(shipment.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Transporte</p>
                                        <div className="flex items-center justify-end gap-2">
                                            <p className="font-bold text-gray-700">{shipment.transport_data.carrier}</p>
                                            {activeTab === 'TRANSIT' && (
                                                <button
                                                    onClick={() => handleEditShipment(shipment)}
                                                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                                    title="Editar Transporte"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">{shipment.transport_data.package_count} Bultos</p>
                                    </div>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-3 mb-4 flex items-center gap-4 overflow-x-auto">
                                    {shipment.items.slice(0, 5).map((item, idx) => (
                                        <div key={idx} className="flex-shrink-0 bg-white border border-gray-200 px-3 py-1.5 rounded-md shadow-sm">
                                            <p className="text-xs font-bold text-gray-700">{item.name}</p>
                                            <p className="text-[10px] text-gray-400">Cant: {item.quantity}</p>
                                        </div>
                                    ))}
                                    {shipment.items.length > 5 && (
                                        <span className="text-xs font-bold text-gray-400">+{shipment.items.length - 5} más...</span>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                                    <button
                                        onClick={() => handleViewDocs(shipment)}
                                        className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <FileText size={16} /> Ver Documentos
                                    </button>
                                    {activeTab === 'INBOUND' && shipment.status === 'IN_TRANSIT' && (
                                        <button
                                            onClick={() => handleReceiveClick(shipment)}
                                            className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg shadow-md shadow-emerald-100 flex items-center gap-2 transition-all transform hover:scale-105"
                                        >
                                            <CheckCircle size={16} />
                                            Recepcionar Carga
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modals */}
            {selectedShipment && (
                <UnifiedReception
                    isOpen={isReceptionModalOpen}
                    onClose={() => { setIsReceptionModalOpen(false); setSelectedShipment(null); }}
                    shipment={selectedShipment}
                />
            )}

            {selectedShipment && (
                <DocumentViewerModal
                    isOpen={isDocViewerOpen}
                    onClose={() => { setIsDocViewerOpen(false); setSelectedShipment(null); }}
                    shipment={selectedShipment}
                />
            )}

            <ScanReceptionModal
                isOpen={isScanReceptionOpen}
                onClose={() => setIsScanReceptionOpen(false)}
            />

            <DispatchWizard
                isOpen={isDispatchModalOpen}
                onClose={() => setIsDispatchModalOpen(false)}
            />
        </div>
    );
};

