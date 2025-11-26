import React, { useState } from 'react';
import { usePharmaStore } from '../store/useStore';
import { Package, Truck, ArrowRight, CheckCircle, AlertTriangle, Search, Filter, FileText, Camera, MapPin, Clock, Download } from 'lucide-react';
import { Shipment } from '../../domain/types';
import ShipmentReceptionModal from '../components/warehouse/ShipmentReceptionModal';
import ShipmentDispatchModal from '../components/warehouse/ShipmentDispatchModal';
import { toast } from 'sonner';

export const WarehouseOps = () => {
    const { shipments } = usePharmaStore();
    const [activeTab, setActiveTab] = useState<'INBOUND' | 'OUTBOUND' | 'TRANSIT' | 'REVERSE'>('INBOUND');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
    const [isReceptionModalOpen, setIsReceptionModalOpen] = useState(false);
    const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);

    // Filter Logic
    const filteredShipments = shipments.filter(s => {
        const matchesSearch =
            s.transport_data.tracking_number.includes(searchTerm) ||
            s.origin_location_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.items.some(i => i.sku.includes(searchTerm));

        if (!matchesSearch) return false;

        if (activeTab === 'INBOUND') return s.status === 'IN_TRANSIT' && s.destination_location_id === 'SUCURSAL_CENTRO'; // Mock current location
        if (activeTab === 'OUTBOUND') return s.origin_location_id === 'SUCURSAL_CENTRO';
        if (activeTab === 'TRANSIT') return s.status === 'IN_TRANSIT' && s.origin_location_id === 'SUCURSAL_CENTRO';
        if (activeTab === 'REVERSE') return s.type === 'RETURN';

        return false;
    });

    const handleReceiveClick = (shipment: Shipment) => {
        setSelectedShipment(shipment);
        setIsReceptionModalOpen(true);
    };

    const handlePrintReport = async () => {
        try {
            // Dynamic import to avoid bundling jsPDF if not used
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

            // Prepare table data
            const tableData = shipments.map(s => [
                new Date(s.created_at).toLocaleDateString('es-CL'),
                s.type === 'INBOUND_PROVIDER' ? 'Entrada' : s.type === 'INTERNAL_TRANSFER' ? 'Transferencia' : 'Devolución',
                `${s.origin_location_id} → ${s.destination_location_id}`,
                s.status.replace('_', ' '),
                s.transport_data.package_count.toString(),
                `$${s.valuation.toLocaleString('es-CL')}`
            ]);

            // Add table
            autoTable(doc, {
                startY: 40,
                head: [['Fecha', 'Tipo', 'Ruta', 'Estado', 'Bultos', 'Valorización']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 3 },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 50 },
                    3: { cellWidth: 30 },
                    4: { cellWidth: 20 },
                    5: { cellWidth: 30 }
                }
            });

            // Footer
            const pageCount = doc.internal.pages.length - 1;
            doc.setFontSize(8);
            doc.text(`Total de registros: ${shipments.length}`, 14, doc.internal.pageSize.height - 10);
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
                    {shipments.filter(s => s.status === 'IN_TRANSIT' && s.destination_location_id === 'SUCURSAL_CENTRO').length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                            {shipments.filter(s => s.status === 'IN_TRANSIT' && s.destination_location_id === 'SUCURSAL_CENTRO').length}
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
                <button className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-gray-600 font-bold text-sm">
                    <Filter className="w-4 h-4" />
                    Filtros
                </button>
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
                                        <p className="font-bold text-gray-700">{shipment.transport_data.carrier}</p>
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
                                    <button className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                                        Ver Documentos
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
                <ShipmentReceptionModal
                    isOpen={isReceptionModalOpen}
                    onClose={() => { setIsReceptionModalOpen(false); setSelectedShipment(null); }}
                    shipment={selectedShipment}
                />
            )}

            <ShipmentDispatchModal
                isOpen={isDispatchModalOpen}
                onClose={() => setIsDispatchModalOpen(false)}
            />
        </div>
    );
};

