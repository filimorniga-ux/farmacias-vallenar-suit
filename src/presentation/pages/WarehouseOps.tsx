import React, { useState } from 'react';
import { Package, Truck, ArrowRight, CheckCircle, Search, Filter, Calendar, Clock, ArrowDown, ArrowUp, X, MapPin, FileText, Camera, RotateCcw, ShoppingCart, Ban, Activity, FileSpreadsheet } from 'lucide-react';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import { Shipment, PurchaseOrder } from '../../domain/types';
// V2: Funciones seguras
import { getRecentMovementsSecure } from '../../actions/inventory-v2';
import { exportStockMovementsSecure, exportPurchaseOrdersSecure } from '../../actions/inventory-export-v2';
import UnifiedReception from '../components/warehouse/UnifiedReception';
import DocumentViewerModal from '../components/warehouse/DocumentViewerModal';
import ScanReceptionModal from '../components/warehouse/ScanReceptionModal';
import DispatchWizard from '../components/warehouse/DispatchWizard';
import BlindReceptionModal from '../components/scm/BlindReceptionModal';
import MobileActionScroll from '../components/ui/MobileActionScroll';
import { toast } from 'sonner';

export const WarehouseOps = () => {
    const { user, shipments, purchaseOrders, cancelShipment, refreshShipments, cancelPurchaseOrder, receivePurchaseOrder, inventory, createDispatch, addPurchaseOrder } = usePharmaStore();
    const { currentLocation } = useLocationStore();
    const currentLocationId = currentLocation?.id || '';

    const [activeTab, setActiveTab] = useState<'INBOUND' | 'OUTBOUND' | 'TRANSIT' | 'REVERSE' | 'SUPPLIER_ORDERS' | 'MOVEMENTS'>('INBOUND');
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch shipments when location or tab changes
    React.useEffect(() => {
        if (currentLocationId && activeTab !== 'MOVEMENTS') {
            refreshShipments(currentLocationId);
        }
    }, [currentLocationId, activeTab]);

    // Modal States
    const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [isScanReceptionOpen, setIsScanReceptionOpen] = useState(false);
    const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false); // For Returns
    const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false); // For Pedido Express
    const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);
    const [isBlindReceptionOpen, setIsBlindReceptionOpen] = useState(false); // For PO Reception

    // Advanced Filters State
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

    // Movements State
    const [movements, setMovements] = useState<any[]>([]);
    const [loadingMovements, setLoadingMovements] = useState(false);

    const isWarehouse = currentLocation?.type === 'WAREHOUSE' || currentLocation?.type === 'HQ';

    // Fetch movements when tab changes to MOVEMENTS or location changes
    React.useEffect(() => {
        if (activeTab === 'MOVEMENTS' && currentLocationId) {
            setLoadingMovements(true);
            // V2: getRecentMovementsSecure retorna { success, data }
            getRecentMovementsSecure(currentLocationId)
                .then((res: { success: boolean; data?: any[] }) => {
                    if (res.success && res.data) setMovements(res.data);
                })
                .catch((err: Error) => console.error("Failed to fetch movements:", err))
                .finally(() => setLoadingMovements(false));
        }
    }, [activeTab, currentLocationId]);

    // Clear all filters
    const handleClearFilters = () => {
        setDateRange({ start: '', end: '' });
        setSortOrder('newest');
        setSearchTerm('');
        toast.success('Filtros limpiados');
    };

    // Manual Refresh
    const handleRefresh = async () => {
        if (!currentLocationId) {
            toast.error('Seleccione una sucursal primero');
            return;
        }

        const refreshPromise = async () => {
            await refreshShipments(currentLocationId);
            if (activeTab === 'MOVEMENTS') {
                const res = await getRecentMovementsSecure(currentLocationId);
                if (res.success && res.data) setMovements(res.data);
            }
        };

        toast.promise(refreshPromise(), {
            loading: 'Sincronizando con base de datos...',
            success: 'Datos actualizados',
            error: 'Error al sincronizar'
        });
    };

    // Filter Logic
    const filteredItems = (() => {
        let items: (Shipment | PurchaseOrder)[] = [];

        if (activeTab === 'SUPPLIER_ORDERS') {
            items = purchaseOrders;
        } else {
            items = shipments;
        }

        return items
            .filter(item => {
                // 1. Text Search
                const searchStr = searchTerm.toLowerCase();
                let matchesSearch = false;

                if ('transport_data' in item) { // Shipment
                    matchesSearch =
                        item.transport_data.tracking_number.toLowerCase().includes(searchStr) ||
                        item.origin_location_id.toLowerCase().includes(searchStr) ||
                        (item.origin_location_name || '').toLowerCase().includes(searchStr) ||
                        (item.destination_location_name || '').toLowerCase().includes(searchStr) ||
                        item.items.some(i => i.sku.toLowerCase().includes(searchStr));
                } else { // PurchaseOrder
                    matchesSearch =
                        item.id.toLowerCase().includes(searchStr) ||
                        item.supplier_id.toLowerCase().includes(searchStr);
                }

                if (!matchesSearch) return false;

                // 2. Date Range
                let matchesDate = true;
                const itemDate = new Date(item.created_at).getTime();

                if (dateRange.start) {
                    const startDate = new Date(dateRange.start).getTime();
                    matchesDate = matchesDate && itemDate >= startDate;
                }

                if (dateRange.end) {
                    const endDate = new Date(dateRange.end);
                    endDate.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && itemDate <= endDate.getTime();
                }

                if (!matchesDate) return false;

                // 3. Tab & Location Logic
                if (activeTab === 'SUPPLIER_ORDERS') {
                    // Show all POs for now, or filter by status if needed
                    return true;
                }
                if (activeTab === 'MOVEMENTS') {
                    // Movements tab has its own data, not filteredItems
                    return false;
                }

                const s = item as Shipment;
                if (isWarehouse) {
                    if (activeTab === 'INBOUND') return s.destination_location_id === currentLocationId && s.type !== 'RETURN';
                    if (activeTab === 'OUTBOUND') return s.origin_location_id === currentLocationId && s.type !== 'RETURN';
                    if (activeTab === 'TRANSIT') return s.status === 'IN_TRANSIT' && (s.origin_location_id === currentLocationId || s.destination_location_id === currentLocationId);
                    if (activeTab === 'REVERSE') return s.type === 'RETURN'; // Warehouse sees all returns? Or just those to it?
                } else {
                    if (activeTab === 'INBOUND') return s.destination_location_id === currentLocationId && s.status !== 'DELIVERED' && s.type !== 'RETURN';
                    if (activeTab === 'OUTBOUND') return s.origin_location_id === currentLocationId && s.type !== 'RETURN';
                    if (activeTab === 'TRANSIT') return s.status === 'IN_TRANSIT' && (s.origin_location_id === currentLocationId || s.destination_location_id === currentLocationId);
                    if (activeTab === 'REVERSE') return s.type === 'RETURN' && (s.origin_location_id === currentLocationId || s.destination_location_id === currentLocationId);
                }

                return false;
            })
            .sort((a, b) => {
                const dateA = new Date(a.created_at).getTime();
                const dateB = new Date(b.created_at).getTime();
                return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
            });
    })();

    const handleReceiveClick = (shipment: Shipment) => {
        setSelectedShipment(shipment);
        setIsReceptionModalOpen(true);
    };

    const handleReceivePO = (po: PurchaseOrder) => {
        setSelectedPO(po);
        setIsBlindReceptionOpen(true);
    };

    const handleBlindReception = (order: PurchaseOrder, receivedItems: { sku: string; receivedQty: number }[]) => {
        receivePurchaseOrder(order.id, receivedItems, currentLocationId);
        setIsBlindReceptionOpen(false);
        setSelectedPO(null);
    };

    const handleCancelShipment = (id: string) => {
        if (confirm('¿Estás seguro de cancelar este envío? El stock volverá al origen.')) {
            cancelShipment(id);
        }
    };

    const handleCancelPO = (id: string) => {
        if (confirm('¿Cancelar este pedido a proveedor?')) {
            cancelPurchaseOrder(id);
            toast.success('Pedido cancelado');
        }
    };

    const handleViewDocs = (shipment: Shipment) => {
        setSelectedShipment(shipment);
        setIsDocViewerOpen(true);
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
                s.type === 'INBOUND' ? 'Entrada' : s.type === 'INTER_BRANCH' ? 'Transferencia' : 'Devolución',
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

    const handleExportExcel = async () => {
        const toastId = toast.loading('Generando Excel...');
        try {
            // Default range: Last 30 days if not specified
            const startDate = dateRange.start
                ? new Date(dateRange.start).toISOString()
                : new Date(new Date().setDate(new Date().getDate() - 30)).toISOString();

            const endDate = dateRange.end
                ? new Date(dateRange.end).toISOString()
                : new Date().toISOString();

            // V2: exportStockMovementsSecure requiere limit
            const params = {
                startDate,
                endDate,
                locationId: currentLocationId,
                limit: 5000 // V2 requiere limit
            };

            let result;
            if (activeTab === 'SUPPLIER_ORDERS') {
                // V2: exportPurchaseOrdersSecure
                const v2Params = {
                    startDate,
                    endDate,
                    locationId: currentLocationId,
                    limit: 5000
                };
                result = await exportPurchaseOrdersSecure(v2Params);
            } else {
                // V2: exportStockMovementsSecure
                const v2Params = {
                    startDate,
                    endDate,
                    locationId: currentLocationId,
                    limit: 5000
                };
                result = await exportStockMovementsSecure(v2Params);
            }

            if (result && result.success && result.data) {
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename || 'reporte.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('Excel descargado correctamente');
            } else {
                toast.error('Error: ' + (result?.error || 'Desconocido'));
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al exportar Excel');
        } finally {
            toast.dismiss(toastId);
        }
    };

    return (
        <div className="p-6 space-y-6 h-[calc(100vh-80px)] overflow-y-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Package className="w-8 h-8 text-blue-600" />
                        Operaciones Logísticas (WMS)
                    </h1>
                    {currentLocation ? (
                        <p className="text-indigo-600 font-bold ml-10 mt-1 italic">
                            Contexto: {currentLocation.name}
                        </p>
                    ) : (
                        <p className="text-amber-600 font-bold ml-10 mt-1 animate-pulse">
                            ⚠️ Por favor, seleccione una sucursal en el encabezado para ver los datos.
                        </p>
                    )}
                </div>
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

                    {(activeTab === 'MOVEMENTS' || activeTab === 'SUPPLIER_ORDERS') && (
                        <button
                            onClick={handleExportExcel}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 font-bold text-sm shadow-lg shadow-green-200"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            Exportar Excel
                        </button>
                    )}

                    {activeTab === 'SUPPLIER_ORDERS' ? (
                        <button
                            onClick={() => setIsPurchaseModalOpen(true)}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 font-bold text-sm shadow-lg shadow-purple-200"
                        >
                            <ShoppingCart className="w-4 h-4" />
                            Nuevo Pedido Express
                        </button>
                    ) : activeTab === 'REVERSE' ? (
                        <button
                            onClick={() => setIsReturnModalOpen(true)}
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-2 font-bold text-sm shadow-lg shadow-amber-200"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Nueva Devolución
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsDispatchModalOpen(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-bold text-sm shadow-lg shadow-blue-200"
                        >
                            <Truck className="w-4 h-4" />
                            Nuevo Despacho
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <MobileActionScroll className="snap-mandatory pb-1">
                    <button
                        onClick={() => setActiveTab('INBOUND')}
                        className={`flex-none min-w-[40%] snap-center pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'INBOUND' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <ArrowRight className="w-4 h-4 rotate-90" />
                        Recepción
                    </button>
                    <button
                        onClick={() => setActiveTab('OUTBOUND')}
                        className={`flex-none min-w-[40%] snap-center pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'OUTBOUND' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <ArrowRight className="w-4 h-4 -rotate-90" />
                        Despacho
                    </button>
                    <button
                        onClick={() => setActiveTab('TRANSIT')}
                        className={`flex-none min-w-[40%] snap-center pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'TRANSIT' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <Truck className="w-4 h-4" />
                        En Tránsito
                    </button>
                    <button
                        onClick={() => setActiveTab('SUPPLIER_ORDERS')}
                        className={`flex-none min-w-[40%] snap-center pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'SUPPLIER_ORDERS' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <ShoppingCart className="w-4 h-4" />
                        Pedidos Proveedor
                    </button>
                    <button
                        onClick={() => setActiveTab('REVERSE')}
                        className={`flex-none min-w-[40%] snap-center pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'REVERSE' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <RotateCcw className="w-4 h-4" />
                        Devoluciones
                    </button>
                    <button
                        onClick={() => setActiveTab('MOVEMENTS')}
                        className={`flex-none min-w-[40%] snap-center pb-3 px-4 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'MOVEMENTS' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <Activity className="w-4 h-4" />
                        Movimientos
                    </button>
                </MobileActionScroll>
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
                        onClick={handleRefresh}
                        className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 flex items-center gap-2 font-bold text-sm transition-all"
                        title="Refrescar datos"
                    >
                        <RotateCcw className={`w-4 h-4 ${loadingMovements ? 'animate-spin' : ''}`} />
                        Refrescar
                    </button>
                    <button
                        onClick={() => setShowFilterPanel(!showFilterPanel)}
                        className={`px-4 py-2 border rounded-lg flex items-center gap-2 font-bold text-sm transition-all ${showFilterPanel
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                            }`}
                    >
                        <Filter className="w-4 h-4" />
                        Filtros
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
                                {filteredItems.length} resultado(s) encontrado(s)
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
                {activeTab === 'MOVEMENTS' ? (
                    movements.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <Activity className="w-16 h-16 mx-auto mb-4 opacity-20" />
                            <h3 className="text-lg font-bold text-gray-500">No hay movimientos recientes</h3>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-3">Fecha/Hora</th>
                                        <th className="px-4 py-3">Tipo</th>
                                        <th className="px-4 py-3">SKU</th>
                                        <th className="px-4 py-3">Producto</th>
                                        <th className="px-4 py-3 text-right">Cant.</th>
                                        <th className="px-4 py-3 text-right">Saldo</th>
                                        <th className="px-4 py-3">Usuario</th>
                                        <th className="px-4 py-3">Notas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {movements.map((mov) => (
                                        <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {new Date(mov.date).toLocaleDateString()} <span className="text-gray-400 text-xs">{new Date(mov.date).toLocaleTimeString()}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold 
                                                    ${mov.type === 'INBOUND' ? 'bg-green-100 text-green-700' :
                                                        mov.type === 'OUTBOUND' ? 'bg-red-100 text-red-700' :
                                                            'bg-blue-100 text-blue-700'}`}>
                                                    {mov.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs">{mov.sku}</td>
                                            <td className="px-4 py-3 font-medium text-gray-800">{mov.product}</td>
                                            <td className="px-4 py-3 text-right font-bold">{mov.quantity}</td>
                                            <td className="px-4 py-3 text-right text-gray-500">{mov.stock ?? '-'}</td>
                                            <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">{mov.user}</td>
                                            <td className="px-4 py-3 text-gray-500 italic truncate max-w-[200px]">{mov.notes}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <Package className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <h3 className="text-lg font-bold text-gray-500">No hay registros encontrados</h3>
                        <p className="text-sm">Intente ajustar los filtros o cree una nueva operación.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {activeTab === 'SUPPLIER_ORDERS' ? (
                            // RENDER PURCHASE ORDERS
                            (filteredItems as PurchaseOrder[]).map(po => (
                                <div key={po.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all bg-white group">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-start gap-4">
                                            <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
                                                <ShoppingCart size={24} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-lg text-gray-800">PO: {po.id.slice(0, 8)}...</span>
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide
                                                        ${po.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                                                            po.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {po.status}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-gray-500">Proveedor: {po.supplier_id}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-bold text-gray-800">${po.total_estimated.toLocaleString()}</p>
                                            <p className="text-xs text-gray-500">{new Date(po.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                                        {po.status !== 'COMPLETED' && po.status !== 'CANCELLED' && (
                                            <>
                                                <button
                                                    onClick={() => handleCancelPO(po.id)}
                                                    className="px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={() => handleReceivePO(po)}
                                                    className="px-4 py-2 text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-md shadow-blue-100"
                                                >
                                                    Recepcionar
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            // RENDER SHIPMENTS
                            (filteredItems as Shipment[]).map(shipment => (
                                <div key={shipment.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all bg-white group">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-3 rounded-xl ${shipment.type === 'RETURN' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                                {shipment.type === 'RETURN' ? <RotateCcw size={24} /> : <Truck size={24} />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-lg text-gray-800">OT: {shipment.transport_data.tracking_number}</span>
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide
                                                        ${shipment.status === 'IN_TRANSIT' ? 'bg-amber-100 text-amber-700' :
                                                            shipment.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' :
                                                                shipment.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                                        {shipment.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                                    <div className="flex items-center gap-1">
                                                        <MapPin size={14} />
                                                        <span>{shipment.origin_location_name || shipment.origin_location_id}</span>
                                                        <ArrowRight size={14} className="mx-1" />
                                                        <span className="font-bold text-gray-700">{shipment.destination_location_name || shipment.destination_location_id}</span>
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

                                        {/* Cancel Action for In Transit */}
                                        {shipment.status === 'IN_TRANSIT' && (activeTab === 'OUTBOUND' || activeTab === 'TRANSIT') && (
                                            <button
                                                onClick={() => handleCancelShipment(shipment.id)}
                                                className="px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                                            >
                                                <Ban size={16} /> Cancelar Envío
                                            </button>
                                        )}

                                        {/* Receive Action */}
                                        {(activeTab === 'INBOUND' || activeTab === 'REVERSE') && shipment.status === 'IN_TRANSIT' && (
                                            <button
                                                onClick={() => handleReceiveClick(shipment)}
                                                className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg shadow-md shadow-emerald-100 flex items-center gap-2 transform hover:scale-105 transition-all"
                                            >
                                                <CheckCircle size={16} />
                                                Recepcionar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
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

            {isDispatchModalOpen && (
                <DispatchWizard
                    isOpen={true}
                    onClose={() => setIsDispatchModalOpen(false)}
                    mode="DISPATCH"
                />
            )}

            {isReturnModalOpen && (
                <DispatchWizard
                    isOpen={true}
                    onClose={() => setIsReturnModalOpen(false)}
                    mode="RETURN"
                />
            )}

            {isPurchaseModalOpen && (
                <DispatchWizard
                    isOpen={true}
                    onClose={() => setIsPurchaseModalOpen(false)}
                    mode="PURCHASE"
                />
            )}

            {selectedPO && (
                <BlindReceptionModal
                    isOpen={isBlindReceptionOpen}
                    onClose={() => { setIsBlindReceptionOpen(false); setSelectedPO(null); }}
                    order={selectedPO}
                    onReceive={handleBlindReception}
                />
            )}
        </div>
    );
};
